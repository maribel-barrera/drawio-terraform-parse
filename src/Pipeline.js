// src/Pipeline.js

import { XMLParser, DrawIOParserError } from "./XMLParser.js";
import { AWSComponentExtractor, AWSExtractionError } from "./AWSComponentExtractor.js";
import { JSONGenerator, JSONGenerationError } from "./JSONGenerator.js";

/**
 * Error personalizado para errores del pipeline
 */
export class PipelineError extends Error {
  constructor(stage, message, context = {}) {
    super(message);
    this.name = 'PipelineError';
    this.stage = stage;
    this.context = context;
  }
}

/**
 * Clase Pipeline que coordina el flujo completo de procesamiento
 * XMLParser → AWSComponentExtractor → JSONGenerator
 */
export class DrawIOJSONPipeline {
  constructor(options = {}) {
    this.xmlParser = new XMLParser();
    this.awsExtractor = new AWSComponentExtractor();
    this.jsonGenerator = new JSONGenerator();
    
    // Configuración del pipeline
    this.config = {
      enableLogging: options.enableLogging || false,
      enableRecovery: options.enableRecovery !== false, // Por defecto habilitado
      validateIntermediateSteps: options.validateIntermediateSteps !== false,
      progressCallback: options.progressCallback || null,
      ...options
    };
    
    // Estado del pipeline
    this.state = {
      currentStage: null,
      startTime: null,
      stageStartTime: null,
      stages: {
        xmlParsing: { status: 'pending', duration: 0, data: null, errors: [] },
        awsExtraction: { status: 'pending', duration: 0, data: null, errors: [] },
        jsonGeneration: { status: 'pending', duration: 0, data: null, errors: [] }
      },
      totalDuration: 0,
      success: false
    };
  }

  /**
   * Registra mensaje de log si está habilitado
   */
  log(message, level = 'info') {
    if (this.config.enableLogging) {
      const timestamp = new Date().toISOString();
      const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
      console.log(`[${timestamp}] ${prefix} ${message}`);
    }
  }

  /**
   * Reporta progreso si hay callback configurado
   */
  reportProgress(stage, progress, message = '') {
    if (this.config.progressCallback) {
      this.config.progressCallback({
        stage,
        progress,
        message,
        totalStages: 3,
        currentStageIndex: this._getStageIndex(stage)
      });
    }
  }

  /**
   * Obtiene el índice de la etapa actual
   * @private
   */
  _getStageIndex(stage) {
    const stages = ['xmlParsing', 'awsExtraction', 'jsonGeneration'];
    return stages.indexOf(stage);
  }

  /**
   * Inicia una nueva etapa del pipeline
   * @private
   */
  _startStage(stageName) {
    this.state.currentStage = stageName;
    this.state.stageStartTime = Date.now();
    this.state.stages[stageName].status = 'running';
    
    this.log(`Iniciando etapa: ${stageName}`);
    this.reportProgress(stageName, 0, `Iniciando ${stageName}`);
  }

  /**
   * Finaliza la etapa actual
   * @private
   */
  _endStage(stageName, success = true, data = null, errors = []) {
    const duration = Date.now() - this.state.stageStartTime;
    
    this.state.stages[stageName] = {
      status: success ? 'completed' : 'failed',
      duration,
      data,
      errors
    };
    
    this.log(`Etapa ${stageName} ${success ? 'completada' : 'falló'} en ${duration}ms`);
    this.reportProgress(stageName, 100, `${stageName} ${success ? 'completada' : 'falló'}`);
  }

  /**
   * Procesa archivo draw.io completo a través del pipeline
   */
  async processFile(inputFilePath, outputFilePath = null) {
    this.state.startTime = Date.now();
    this.state.success = false;
    
    try {
      this.log(`Iniciando procesamiento del pipeline para: ${inputFilePath}`);
      
      // Etapa 1: Parsing XML
      const xmlResult = await this._executeXMLParsing(inputFilePath);
      
      // Etapa 2: Extracción AWS
      const awsResult = await this._executeAWSExtraction(xmlResult.elements);
      
      // Etapa 3: Generación JSON
      const jsonResult = await this._executeJSONGeneration(awsResult.components);
      
      // Escribir archivo de salida si se especifica
      if (outputFilePath) {
        await this._writeOutputFile(outputFilePath, jsonResult.configuration);
      }
      
      // Finalizar pipeline exitosamente
      this.state.totalDuration = Date.now() - this.state.startTime;
      this.state.success = true;
      
      this.log(`Pipeline completado exitosamente en ${this.state.totalDuration}ms`);
      
      return {
        success: true,
        xmlResult,
        awsResult,
        jsonResult,
        outputFile: outputFilePath,
        stats: this._generateStats()
      };
      
    } catch (error) {
      this.state.totalDuration = Date.now() - this.state.startTime;
      this.log(`Pipeline falló: ${error.message}`, 'error');
      
      // Intentar recuperación si está habilitada
      if (this.config.enableRecovery && error instanceof PipelineError) {
        return await this._attemptRecovery(error, inputFilePath, outputFilePath);
      }
      
      throw error;
    }
  }

  /**
   * Ejecuta la etapa de parsing XML
   * @private
   */
  async _executeXMLParsing(inputFilePath) {
    this._startStage('xmlParsing');
    
    try {
      this.reportProgress('xmlParsing', 25, 'Leyendo archivo draw.io');
      
      // Parsear archivo draw.io
      const mxGraphModel = await this.xmlParser.parseDrawIOFile(inputFilePath);
      
      this.reportProgress('xmlParsing', 50, 'Validando formato draw.io');
      
      // Validar formato
      this.xmlParser.validateDrawIOFormat({ mxGraphModel });
      
      this.reportProgress('xmlParsing', 75, 'Extrayendo elementos gráficos');
      
      // Extraer elementos gráficos
      const graphElements = this.xmlParser.extractGraphElements({ mxGraphModel });
      const elements = this._convertGraphToElements(graphElements);
      
      // Validar que se encontraron elementos
      if (elements.length === 0) {
        throw new PipelineError(
          'xmlParsing',
          'No se encontraron elementos gráficos en el archivo draw.io',
          { inputFile: inputFilePath, graphElements }
        );
      }
      
      const result = {
        mxGraphModel,
        graphElements,
        elements,
        elementCount: elements.length
      };
      
      this._endStage('xmlParsing', true, result);
      
      this.log(`XML parsing completado: ${elements.length} elementos encontrados`);
      
      return result;
      
    } catch (error) {
      const pipelineError = error instanceof DrawIOParserError 
        ? new PipelineError('xmlParsing', `Error de parsing XML: ${error.message}`, { originalError: error })
        : error instanceof PipelineError 
        ? error 
        : new PipelineError('xmlParsing', `Error inesperado en parsing XML: ${error.message}`, { originalError: error });
      
      this._endStage('xmlParsing', false, null, [pipelineError]);
      throw pipelineError;
    }
  }

  /**
   * Ejecuta la etapa de extracción de componentes AWS
   * @private
   */
  async _executeAWSExtraction(elements) {
    this._startStage('awsExtraction');
    
    try {
      this.reportProgress('awsExtraction', 10, 'Extrayendo información del proyecto');
      
      // Extraer información del proyecto desde la tabla del diagrama
      const projectInfo = this.awsExtractor.extractProjectInfo(elements);
      
      this.reportProgress('awsExtraction', 25, 'Identificando componentes AWS');
      
      // Identificar componentes AWS
      const identifiedComponents = this.awsExtractor.identifyAWSComponents(elements);
      
      this.reportProgress('awsExtraction', 45, 'Extrayendo información de VPCs');
      
      // Extraer información detallada de VPCs
      const vpcInfo = identifiedComponents.vpcs.length > 0 
        ? this.awsExtractor.extractVPCInfo(identifiedComponents.vpcs)
        : [];
      
      this.reportProgress('awsExtraction', 65, 'Extrayendo información de subnets');
      
      // Extraer información detallada de subnets
      const subnetInfo = identifiedComponents.subnets.length > 0
        ? this.awsExtractor.extractSubnetInfo(identifiedComponents.subnets)
        : [];
      
      this.reportProgress('awsExtraction', 85, 'Extrayendo información de route tables');
      
      // Extraer información de route tables
      const routeTableInfo = this.awsExtractor.extractRouteTableInfo(elements);
      
      // Compilar componentes procesados incluyendo información del proyecto
      const components = {
        projectInfo, // Agregar información del proyecto
        vpcs: vpcInfo,
        subnets: subnetInfo,
        routeTables: routeTableInfo.routeTables || [],
        services: identifiedComponents.services || [],
        unidentified: identifiedComponents.unidentified || []
      };
      
      // Generar estadísticas
      const stats = {
        totalElements: elements.length,
        projectInfo: {
          source: projectInfo.source,
          hasProjectName: !!projectInfo.project_name,
          hasEnvironment: !!projectInfo.environment,
          hasEcosistema: !!projectInfo.ecosistema
        },
        identifiedComponents: {
          vpcs: vpcInfo.length,
          subnets: subnetInfo.length,
          routeTables: routeTableInfo.routeTables?.length || 0,
          services: identifiedComponents.services?.length || 0
        },
        unidentifiedElements: identifiedComponents.unidentified?.length || 0
      };
      
      // Validar que se encontraron componentes AWS si está habilitado
      if (this.config.validateIntermediateSteps) {
        const totalAWSComponents = stats.identifiedComponents.vpcs + 
                                  stats.identifiedComponents.subnets + 
                                  stats.identifiedComponents.services;
        
        if (totalAWSComponents === 0) {
          const analysis = this.awsExtractor.detectDiagramsWithoutAWSComponents(elements);
          
          this.log('Advertencia: No se encontraron componentes AWS válidos', 'warn');
          
          // No fallar el pipeline, pero registrar advertencia
          components._warnings = analysis.recommendations;
        }
      }
      
      const result = {
        components,
        stats,
        originalElements: elements
      };
      
      this._endStage('awsExtraction', true, result);
      
      this.log(`AWS extraction completado: Proyecto: ${projectInfo.project_name} (${projectInfo.environment}), ${stats.identifiedComponents.vpcs} VPCs, ${stats.identifiedComponents.subnets} subnets, ${stats.identifiedComponents.services} servicios`);
      
      return result;
      
    } catch (error) {
      const pipelineError = error instanceof AWSExtractionError
        ? new PipelineError('awsExtraction', `Error de extracción AWS: ${error.message}`, { originalError: error })
        : error instanceof PipelineError
        ? error
        : new PipelineError('awsExtraction', `Error inesperado en extracción AWS: ${error.message}`, { originalError: error });
      
      this._endStage('awsExtraction', false, null, [pipelineError]);
      throw pipelineError;
    }
  }

  /**
   * Ejecuta la etapa de generación de configuración JSON
   * @private
   */
  async _executeJSONGeneration(components) {
    this._startStage('jsonGeneration');
    
    try {
      this.reportProgress('jsonGeneration', 25, 'Generando configuración JSON');
      
      // Generar configuración JSON
      const configuration = this.jsonGenerator.generateConfiguration(components);
      
      this.reportProgress('jsonGeneration', 50, 'Validando estructura de salida');
      
      // Validar estructura de salida
      this.jsonGenerator.validateOutputStructure(configuration);
      
      this.reportProgress('jsonGeneration', 75, 'Serializando a JSON');
      
      // Serializar a JSON
      const jsonOutput = this.jsonGenerator.serializeToJSON(configuration, 2);
      
      // Validar round trip si está habilitado
      if (this.config.validateIntermediateSteps) {
        this.reportProgress('jsonGeneration', 90, 'Validando round trip');
        
        const roundTripResult = this.jsonGenerator.validateRoundTrip(configuration);
        if (!roundTripResult.success) {
          this.log('Advertencia: Validación round trip falló', 'warn');
        }
      }
      
      const result = {
        configuration,
        jsonOutput,
        size: jsonOutput.length,
        stats: {
          subnets: Object.keys(configuration.subnets || {}).length,
          routeTables: Object.keys(configuration.route_tables || {}).length,
          hasMainRT: !!configuration.main_rt
        }
      };
      
      this._endStage('jsonGeneration', true, result);
      
      this.log(`JSON generation completado: ${result.size} bytes generados`);
      
      return result;
      
    } catch (error) {
      const pipelineError = error instanceof JSONGenerationError
        ? new PipelineError('jsonGeneration', `Error de generación JSON: ${error.message}`, { originalError: error })
        : error instanceof PipelineError
        ? error
        : new PipelineError('jsonGeneration', `Error inesperado en generación JSON: ${error.message}`, { originalError: error });
      
      this._endStage('jsonGeneration', false, null, [pipelineError]);
      throw pipelineError;
    }
  }

  /**
   * Escribe el archivo de salida
   * @private
   */
  async _writeOutputFile(outputFilePath, configuration) {
    try {
      const { writeFile } = await import('node:fs/promises');
      const jsonOutput = this.jsonGenerator.serializeToJSON(configuration, 2);
      await writeFile(outputFilePath, jsonOutput, 'utf8');
      
      this.log(`Archivo de salida escrito: ${outputFilePath}`);
    } catch (error) {
      throw new PipelineError(
        'fileOutput',
        `Error al escribir archivo de salida: ${error.message}`,
        { outputFile: outputFilePath, originalError: error }
      );
    }
  }

  /**
   * Convierte elementos del grafo a formato estándar
   * @private
   */
  _convertGraphToElements(graphModel) {
    const elements = [];
    
    if (!graphModel || !graphModel.root) {
      return elements;
    }

    const root = graphModel.root;
    
    // Procesar UserObjects
    if (root.UserObject) {
      const userObjects = Array.isArray(root.UserObject) ? root.UserObject : [root.UserObject];
      userObjects.forEach(uo => {
        if (uo.mxCell && uo.mxCell.id) {
          const element = {
            id: uo.mxCell.id,
            vertex: uo.mxCell.vertex === "1",
            edge: uo.mxCell.edge === "1",
            style: uo.mxCell.style || '',
            parent: uo.mxCell.parent,
            source: uo.mxCell.source,
            target: uo.mxCell.target,
            value: uo.label || uo.mxCell.value || '',
            label: uo.label || uo.mxCell.value || '',
            props: { ...uo }
          };
          delete element.props.mxCell;
          elements.push(element);
        }
      });
    }

    // Procesar mxCells directas
    if (root.mxCell) {
      const mxCells = Array.isArray(root.mxCell) ? root.mxCell : [root.mxCell];
      mxCells.forEach(cell => {
        if (cell.id) {
          const element = {
            id: cell.id,
            vertex: cell.vertex === "1",
            edge: cell.edge === "1",
            style: cell.style || '',
            parent: cell.parent,
            source: cell.source,
            target: cell.target,
            value: cell.value || '',
            label: cell.value || '',
            props: {}
          };
          elements.push(element);
        }
      });
    }

    return elements;
  }

  /**
   * Intenta recuperación de errores
   * @private
   */
  async _attemptRecovery(error, inputFilePath, outputFilePath) {
    this.log(`Intentando recuperación para error en etapa: ${error.stage}`, 'warn');
    
    try {
      // Estrategias de recuperación por etapa
      switch (error.stage) {
        case 'xmlParsing':
          return await this._recoverFromXMLError(error, inputFilePath, outputFilePath);
          
        case 'awsExtraction':
          return await this._recoverFromAWSError(error, inputFilePath, outputFilePath);
          
        case 'jsonGeneration':
          return await this._recoverFromJSONError(error, inputFilePath, outputFilePath);
          
        default:
          throw new PipelineError('recovery', `No hay estrategia de recuperación para etapa: ${error.stage}`);
      }
    } catch (recoveryError) {
      this.log(`Recuperación falló: ${recoveryError.message}`, 'error');
      
      return {
        success: false,
        error: error.message,
        recoveryError: recoveryError.message,
        stats: this._generateStats()
      };
    }
  }

  /**
   * Recuperación de errores XML
   * @private
   */
  async _recoverFromXMLError(error, inputFilePath, outputFilePath) {
    // Para errores XML, no hay mucha recuperación posible
    // Pero podemos intentar generar una configuración mínima
    this.log('Generando configuración mínima debido a error XML', 'warn');
    
    const minimalComponents = {
      projectInfo: {
        project_name: 'aws-project',
        area: 'development',
        ecosistema: 'cloud',
        environment: 'dev',
        source: 'xml_error_recovery'
      },
      vpcs: [],
      subnets: [],
      routeTables: [],
      services: []
    };
    
    const jsonResult = await this._executeJSONGeneration(minimalComponents);
    
    if (outputFilePath) {
      await this._writeOutputFile(outputFilePath, jsonResult.configuration);
    }
    
    return {
      success: true,
      recovered: true,
      recoveryMethod: 'minimal_configuration',
      jsonResult,
      outputFile: outputFilePath,
      stats: this._generateStats(),
      warnings: ['Se generó configuración mínima debido a errores en el archivo draw.io']
    };
  }

  /**
   * Recuperación de errores AWS
   * @private
   */
  async _recoverFromAWSError(error, inputFilePath, outputFilePath) {
    // Intentar con componentes parciales si están disponibles
    const xmlResult = this.state.stages.xmlParsing.data;
    
    if (xmlResult && xmlResult.elements) {
      this.log('Intentando extracción AWS con configuración relajada', 'warn');
      
      // Intentar extraer al menos la información del proyecto
      let projectInfo = {
        project_name: 'aws-project',
        area: 'development',
        ecosistema: 'cloud',
        environment: 'dev',
        source: 'recovery_default'
      };
      
      try {
        projectInfo = this.awsExtractor.extractProjectInfo(xmlResult.elements);
      } catch (projectError) {
        this.log('No se pudo extraer información del proyecto, usando valores por defecto', 'warn');
      }
      
      // Usar solo elementos básicos sin validación estricta
      const basicComponents = {
        projectInfo,
        vpcs: [],
        subnets: [],
        routeTables: [],
        services: []
      };
      
      const jsonResult = await this._executeJSONGeneration(basicComponents);
      
      if (outputFilePath) {
        await this._writeOutputFile(outputFilePath, jsonResult.configuration);
      }
      
      return {
        success: true,
        recovered: true,
        recoveryMethod: 'basic_components_with_project_info',
        jsonResult,
        outputFile: outputFilePath,
        stats: this._generateStats(),
        warnings: ['Se generó configuración básica debido a errores en extracción AWS']
      };
    }
    
    throw new PipelineError('recovery', 'No se pueden recuperar datos XML para recuperación AWS');
  }

  /**
   * Recuperación de errores JSON
   * @private
   */
  async _recoverFromJSONError(error, inputFilePath, outputFilePath) {
    const awsResult = this.state.stages.awsExtraction.data;
    
    if (awsResult && awsResult.components) {
      this.log('Intentando generación JSON con recuperación de errores', 'warn');
      
      const recovery = await this.jsonGenerator.attemptErrorRecovery(
        awsResult.components,
        { error: error.message, context: error.context }
      );
      
      if (recovery.success && outputFilePath) {
        await this._writeOutputFile(outputFilePath, recovery.configuration);
      }
      
      return {
        success: recovery.success,
        recovered: true,
        recoveryMethod: 'json_error_recovery',
        jsonResult: recovery,
        outputFile: outputFilePath,
        stats: this._generateStats(),
        warnings: recovery.warnings || []
      };
    }
    
    throw new PipelineError('recovery', 'No se pueden recuperar datos AWS para recuperación JSON');
  }

  /**
   * Genera estadísticas del pipeline
   * @private
   */
  _generateStats() {
    return {
      totalDuration: this.state.totalDuration,
      success: this.state.success,
      stages: {
        xmlParsing: {
          status: this.state.stages.xmlParsing.status,
          duration: this.state.stages.xmlParsing.duration,
          elementsFound: this.state.stages.xmlParsing.data?.elementCount || 0
        },
        awsExtraction: {
          status: this.state.stages.awsExtraction.status,
          duration: this.state.stages.awsExtraction.duration,
          componentsFound: this.state.stages.awsExtraction.data?.stats?.identifiedComponents || {}
        },
        jsonGeneration: {
          status: this.state.stages.jsonGeneration.status,
          duration: this.state.stages.jsonGeneration.duration,
          outputSize: this.state.stages.jsonGeneration.data?.size || 0
        }
      }
    };
  }

  /**
   * Obtiene el estado actual del pipeline
   */
  getState() {
    return {
      ...this.state,
      stats: this._generateStats()
    };
  }

  /**
   * Reinicia el estado del pipeline
   */
  reset() {
    this.state = {
      currentStage: null,
      startTime: null,
      stageStartTime: null,
      stages: {
        xmlParsing: { status: 'pending', duration: 0, data: null, errors: [] },
        awsExtraction: { status: 'pending', duration: 0, data: null, errors: [] },
        jsonGeneration: { status: 'pending', duration: 0, data: null, errors: [] }
      },
      totalDuration: 0,
      success: false
    };
  }
}
