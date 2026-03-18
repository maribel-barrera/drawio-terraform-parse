#!/usr/bin/env node

import { XMLParser, DrawIOParserError } from "../src/XMLParser.js";
import { AWSComponentExtractor, AWSExtractionError } from "../src/AWSComponentExtractor.js";
import { TerraformJSONGenerator, TerraformGenerationError } from "../src/TerraformJSONGenerator.js";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Clase principal del CLI que coordina el pipeline completo
 */
class DrawIOTerraformCLI {
  constructor() {
    this.xmlParser = new XMLParser();
    this.awsExtractor = new AWSComponentExtractor();
    this.terraformGenerator = new TerraformJSONGenerator();
    this.verbose = false;
    this.startTime = null;
  }

  /**
   * Muestra la ayuda del comando
   */
  printHelp() {
    console.log(`
drawio-terraform-parser - Extrae componentes AWS de diagramas draw.io y genera configuración Terraform

USAGE:
  drawio-terraform-parser --input <archivo.drawio> --output <config.json> [opciones]

ARGUMENTOS REQUERIDOS:
  --input, -i    Ruta al archivo draw.io (.drawio o .xml)
  --output, -o   Ruta del archivo JSON de salida

OPCIONES:
  --verbose, -v  Mostrar información detallada del procesamiento
  --validate     Solo validar el archivo sin generar salida
  --help, -h     Mostrar esta ayuda

EJEMPLOS:
  # Procesar diagrama y generar configuración Terraform
  drawio-terraform-parser -i architecture.drawio -o terraform-config.json

  # Procesar con información detallada
  drawio-terraform-parser -i diagram.xml -o config.json --verbose

  # Solo validar archivo sin generar salida
  drawio-terraform-parser -i diagram.drawio --validate

FORMATOS SOPORTADOS:
  - Archivos .drawio (formato nativo de draw.io)
  - Archivos .xml (exportados desde draw.io)
  - Archivos con contenido comprimido base64

SALIDA:
  El archivo JSON generado contiene la configuración Terraform con:
  - Información de VPC (CIDR, región, nombre)
  - Configuración de subnets (públicas, privadas ruteables, privadas no ruteables)
  - Tablas de enrutamiento y asociaciones
  - Metadatos y tags para todos los recursos

Para más información, visite: https://github.com/your-repo/drawio-terraform-parser
`);
  }

  /**
   * Parsea argumentos de línea de comandos
   */
  parseArguments(args) {
    const config = {
      inputFile: null,
      outputFile: null,
      verbose: false,
      validateOnly: false,
      showHelp: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--input':
        case '-i':
          config.inputFile = args[i + 1];
          i++; // Skip next argument
          break;
          
        case '--output':
        case '-o':
          config.outputFile = args[i + 1];
          i++; // Skip next argument
          break;
          
        case '--verbose':
        case '-v':
          config.verbose = true;
          break;
          
        case '--validate':
          config.validateOnly = true;
          break;
          
        case '--help':
        case '-h':
          config.showHelp = true;
          break;
          
        default:
          if (arg.startsWith('-')) {
            throw new Error(`Opción desconocida: ${arg}`);
          }
      }
    }

    return config;
  }

  /**
   * Valida argumentos de entrada
   */
  validateArguments(config) {
    const errors = [];

    // Validar archivo de entrada
    if (!config.inputFile) {
      errors.push('Se requiere especificar archivo de entrada con --input');
    } else {
      const inputPath = resolve(config.inputFile);
      if (!existsSync(inputPath)) {
        errors.push(`Archivo de entrada no encontrado: ${config.inputFile}`);
      }
    }

    // Validar archivo de salida (solo si no es validate-only)
    if (!config.validateOnly && !config.outputFile) {
      errors.push('Se requiere especificar archivo de salida con --output (o usar --validate)');
    }

    if (errors.length > 0) {
      throw new Error(`Errores de validación:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }
  }

  /**
   * Registra mensaje con timestamp si verbose está habilitado
   */
  log(message, force = false) {
    if (this.verbose || force) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${message}`);
    }
  }

  /**
   * Registra error con formato consistente
   */
  logError(message, error = null) {
    console.error(`❌ ERROR: ${message}`);
    if (error && this.verbose) {
      console.error(`   Detalles: ${error.message}`);
      if (error.context) {
        console.error(`   Contexto:`, JSON.stringify(error.context, null, 2));
      }
    }
  }

  /**
   * Registra advertencia
   */
  logWarning(message) {
    console.warn(`⚠️  ADVERTENCIA: ${message}`);
  }

  /**
   * Registra éxito
   */
  logSuccess(message) {
    console.log(`✅ ${message}`);
  }

  /**
   * Ejecuta el pipeline completo de procesamiento
   */
  async processPipeline(inputFile, outputFile = null) {
    this.startTime = Date.now();
    let stats = {
      inputFile: inputFile,
      outputFile: outputFile,
      processingTime: 0,
      steps: {
        xmlParsing: { success: false, duration: 0, elementsFound: 0 },
        awsExtraction: { success: false, duration: 0, componentsFound: 0 },
        terraformGeneration: { success: false, duration: 0, configSize: 0 }
      }
    };

    try {
      // Paso 1: Parsing XML
      this.log('🔄 Iniciando parsing del archivo draw.io...');
      const xmlStart = Date.now();
      
      const mxGraphModel = await this.xmlParser.parseDrawIOFile(inputFile);
      this.log(`📄 Archivo XML parseado exitosamente`);
      
      // Extraer elementos gráficos
      const graphElements = this.xmlParser.extractGraphElements({ mxGraphModel });
      const elements = this._extractElementsFromGraph(graphElements);
      
      stats.steps.xmlParsing = {
        success: true,
        duration: Date.now() - xmlStart,
        elementsFound: elements.length
      };
      
      this.log(`📊 Elementos gráficos extraídos: ${elements.length}`);

      // Paso 2: Extracción de componentes AWS
      this.log('🔄 Identificando componentes AWS...');
      const awsStart = Date.now();
      
      const awsComponents = this.awsExtractor.identifyAWSComponents(elements);
      
      // Extraer información del proyecto desde el alias de cuenta AWS
      const projectInfo = this.awsExtractor.extractProjectInfo(elements);
      
      // Extraer información detallada de cada tipo de componente
      const vpcInfo = this.awsExtractor.extractVPCInfo(awsComponents.vpcs);
      const subnetInfo = this.awsExtractor.extractSubnetInfo(awsComponents.subnets);
      const routeTableInfo = this.awsExtractor.extractRouteTableInfo(elements);
      
      const processedComponents = {
        projectInfo,
        vpcs: vpcInfo,
        subnets: subnetInfo,
        routeTables: routeTableInfo.routeTables,
        services: awsComponents.services,
        summary: {
          vpcs: vpcInfo.length,
          subnets: subnetInfo.length,
          routeTables: routeTableInfo.routeTables.length,
          services: awsComponents.services.length
        }
      };

      stats.steps.awsExtraction = {
        success: true,
        duration: Date.now() - awsStart,
        componentsFound: processedComponents.summary.vpcs + 
                        processedComponents.summary.subnets + 
                        processedComponents.summary.services
      };

      this.log(`🏗️  Componentes AWS identificados:`);
      this.log(`   - VPCs: ${processedComponents.summary.vpcs}`);
      this.log(`   - Subnets: ${processedComponents.summary.subnets}`);
      this.log(`   - Route Tables: ${processedComponents.summary.routeTables}`);
      this.log(`   - Servicios: ${processedComponents.summary.services}`);

      // Verificar si se encontraron componentes AWS
      const totalComponents = processedComponents.summary.vpcs + 
                             processedComponents.summary.subnets + 
                             processedComponents.summary.services;
      
      if (totalComponents === 0) {
        const analysis = this.awsExtractor.detectDiagramsWithoutAWSComponents(elements);
        this.logWarning('No se encontraron componentes AWS en el diagrama');
        
        if (analysis.recommendations.length > 0) {
          this.log('💡 Recomendaciones:');
          analysis.recommendations.forEach(rec => this.log(`   - ${rec}`));
        }
      }

      // Paso 3: Generación de configuración Terraform
      if (outputFile) {
        this.log('🔄 Generando configuración Terraform...');
        const terraformStart = Date.now();
        
        const terraformConfig = this.terraformGenerator.generateConfiguration(processedComponents);
        
        // Serializar a JSON
        const jsonOutput = this.terraformGenerator.serializeToJSON(terraformConfig, 2);
        
        stats.steps.terraformGeneration = {
          success: true,
          duration: Date.now() - terraformStart,
          configSize: jsonOutput.length
        };

        // Escribir archivo de salida
        await writeFile(outputFile, jsonOutput, 'utf8');
        
        this.logSuccess(`Configuración Terraform generada: ${outputFile}`);
        this.log(`📦 Tamaño del archivo: ${Math.round(jsonOutput.length / 1024)} KB`);
      }

      // Calcular tiempo total
      stats.processingTime = Date.now() - this.startTime;
      
      return {
        success: true,
        stats: stats,
        components: processedComponents
      };

    } catch (error) {
      stats.processingTime = Date.now() - this.startTime;
      
      // Manejar diferentes tipos de errores
      if (error instanceof DrawIOParserError) {
        this.logError('Error al parsear archivo draw.io', error);
        const errorDetails = this.xmlParser.getErrorDetails(error);
        
        if (errorDetails.suggestions.length > 0) {
          this.log('💡 Sugerencias:');
          errorDetails.suggestions.forEach(suggestion => this.log(`   - ${suggestion}`));
        }
      } else if (error instanceof AWSExtractionError) {
        this.logError('Error al extraer componentes AWS', error);
      } else if (error instanceof TerraformGenerationError) {
        this.logError('Error al generar configuración Terraform', error);
        
        // Intentar recuperación de errores
        if (outputFile) {
          this.log('🔄 Intentando recuperación de errores...');
          try {
            const recovery = await this.terraformGenerator.attemptErrorRecovery(
              stats.components || {}, 
              { error: error.message, context: error.context }
            );
            
            if (recovery.success) {
              const recoveredJson = this.terraformGenerator.serializeToJSON(recovery.configuration, 2);
              await writeFile(outputFile, recoveredJson, 'utf8');
              
              this.logWarning(`Configuración recuperada generada: ${outputFile}`);
              this.log('⚠️  La configuración puede requerir ajustes manuales');
              
              if (recovery.warnings && recovery.warnings.length > 0) {
                recovery.warnings.forEach(warning => this.logWarning(warning));
              }
              
              return {
                success: true,
                recovered: true,
                stats: stats,
                recovery: recovery
              };
            }
          } catch (recoveryError) {
            this.logError('La recuperación de errores también falló', recoveryError);
          }
        }
      } else {
        this.logError('Error inesperado durante el procesamiento', error);
      }

      return {
        success: false,
        error: error.message,
        stats: stats
      };
    }
  }

  /**
   * Ejecuta solo validación del archivo
   */
  async validateFile(inputFile) {
    this.log('🔍 Validando archivo draw.io...');
    
    try {
      // Validar parsing XML
      const mxGraphModel = await this.xmlParser.parseDrawIOFile(inputFile);
      this.logSuccess('Archivo XML válido');
      
      // Validar formato draw.io
      const graphElements = this.xmlParser.extractGraphElements({ mxGraphModel });
      this.logSuccess('Formato draw.io válido');
      
      // Extraer y analizar elementos
      const elements = this._extractElementsFromGraph(graphElements);
      this.log(`📊 Elementos encontrados: ${elements.length}`);
      
      // Analizar componentes AWS
      const analysis = this.awsExtractor.detectDiagramsWithoutAWSComponents(elements);
      
      if (analysis.hasAWSComponents) {
        this.logSuccess(`Componentes AWS encontrados:`);
        this.log(`   - VPCs: ${analysis.awsComponentsFound.vpcs}`);
        this.log(`   - Subnets: ${analysis.awsComponentsFound.subnets}`);
        this.log(`   - Servicios: ${analysis.awsComponentsFound.services}`);
      } else {
        this.logWarning('No se encontraron componentes AWS');
        
        if (analysis.recommendations.length > 0) {
          this.log('💡 Recomendaciones:');
          analysis.recommendations.forEach(rec => this.log(`   - ${rec}`));
        }
      }
      
      // Validar completitud de componentes
      if (analysis.hasAWSComponents) {
        const awsComponents = this.awsExtractor.identifyAWSComponents(elements);
        const allComponents = [
          ...awsComponents.vpcs,
          ...awsComponents.subnets,
          ...awsComponents.services
        ];
        
        const completenessReport = this.awsExtractor.reportIncompleteComponents(allComponents);
        
        if (completenessReport.criticalIssues.length > 0) {
          this.logWarning(`${completenessReport.criticalIssues.length} issues críticos encontrados`);
        }
        
        if (completenessReport.warnings.length > 0) {
          this.log(`⚠️  ${completenessReport.warnings.length} advertencias encontradas`);
        }
        
        this.log(`✅ Componentes completos: ${completenessReport.completeComponents}/${completenessReport.totalComponents}`);
      }
      
      this.logSuccess('Validación completada exitosamente');
      return true;
      
    } catch (error) {
      if (error instanceof DrawIOParserError) {
        this.logError('Archivo draw.io inválido', error);
        const errorDetails = this.xmlParser.getErrorDetails(error);
        
        if (errorDetails.suggestions.length > 0) {
          this.log('💡 Sugerencias para corregir:');
          errorDetails.suggestions.forEach(suggestion => this.log(`   - ${suggestion}`));
        }
      } else {
        this.logError('Error durante la validación', error);
      }
      
      return false;
    }
  }

  /**
   * Extrae elementos del grafo parseado
   * @private
   */
  _extractElementsFromGraph(graphModel) {
    const elements = [];
    
    if (!graphModel || !graphModel.root) {
      return elements;
    }

    const root = graphModel.root;
    
    // Procesar UserObjects
    if (root.UserObject) {
      const userObjects = Array.isArray(root.UserObject) ? root.UserObject : [root.UserObject];
      userObjects.forEach(uo => {
        if (uo.mxCell) {
          const element = {
            id: uo.mxCell.id || uo.id,
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
   * Punto de entrada principal del CLI
   */
  async run(args) {
    try {
      // Parsear argumentos
      const config = this.parseArguments(args);
      
      // Mostrar ayuda si se solicita o no hay argumentos
      if (config.showHelp || args.length === 0) {
        this.printHelp();
        return 0;
      }

      // Configurar verbosidad
      this.verbose = config.verbose;

      // Validar argumentos
      this.validateArguments(config);

      // Ejecutar acción solicitada
      if (config.validateOnly) {
        const isValid = await this.validateFile(config.inputFile);
        return isValid ? 0 : 1;
      } else {
        const result = await this.processPipeline(config.inputFile, config.outputFile);
        
        if (this.verbose && result.stats) {
          this.log('\n📈 Estadísticas de procesamiento:');
          this.log(`   Tiempo total: ${result.stats.processingTime}ms`);
          this.log(`   XML parsing: ${result.stats.steps.xmlParsing.duration}ms`);
          this.log(`   AWS extraction: ${result.stats.steps.awsExtraction.duration}ms`);
          this.log(`   Terraform generation: ${result.stats.steps.terraformGeneration.duration}ms`);
        }
        
        return result.success ? 0 : 1;
      }
      
    } catch (error) {
      this.logError('Error en argumentos de línea de comandos', error);
      this.printHelp();
      return 1;
    }
  }
}

/**
 * Función principal
 */
async function main() {
  const cli = new DrawIOTerraformCLI();
  const exitCode = await cli.run(process.argv.slice(2));
  process.exit(exitCode);
}

// Ejecutar solo si es el módulo principal
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && __filename === resolve(process.argv[1])) {
  main().catch(error => {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  });
}