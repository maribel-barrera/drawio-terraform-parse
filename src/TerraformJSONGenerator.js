// src/TerraformJSONGenerator.js

/**
 * Error personalizado para errores de generación de configuración Terraform
 */
export class TerraformGenerationError extends Error {
  constructor(type, message, context = {}) {
    super(message);
    this.name = 'TerraformGenerationError';
    this.type = type;
    this.context = context;
  }
}

/**
 * Clase TerraformJSONGenerator para generar configuraciones JSON de Terraform
 * basadas en componentes AWS extraídos de diagramas draw.io
 */
export class TerraformJSONGenerator {
  constructor() {
    // Configuración por defecto según requerimientos
    this.defaultConfig = {
      project_name: 'aws-project',
      area: 'development',
      ecosistema: 'cloud',
      environment: 'dev',
      region: 'us-east-1',
      has_internet: true,
      existing_vpc: null,
      s3_enable_versioning: 'Enabled'
    };

    // Patrones para clasificar tipos de subnet
    this.subnetTypePatterns = {
      public: /public|internet|igw/i,
      private_routable: /private.*routable|private(?!.*non.*routable)/i,
      private_non_routable: /private.*non.*routable|isolated|no.*route/i
    };
  }

  /**
   * Genera la configuración completa de Terraform en formato JSON
   * @param {Object} awsComponents - Componentes AWS extraídos del diagrama
   * @returns {Object} - Configuración JSON de Terraform
   */
  generateConfiguration(awsComponents) {
    if (!awsComponents || typeof awsComponents !== 'object' || Array.isArray(awsComponents)) {
      throw new TerraformGenerationError(
        'INVALID_INPUT',
        'Los componentes AWS deben ser un objeto válido',
        { receivedType: typeof awsComponents, isArray: Array.isArray(awsComponents) }
      );
    }

    try {
      // Extraer información del proyecto desde el diagrama
      const projectInfo = awsComponents.projectInfo || {};
      
      // Extraer información básica del VPC
      const vpcInfo = this._extractVPCInfo(awsComponents);
      
      // Crear estructura de subnets
      const subnetStructure = this.createSubnetStructure(awsComponents.subnets || []);
      
      // Crear estructura de route tables
      const routeTableStructure = this.createRouteTableStructure(
        awsComponents.routeTables || [],
        awsComponents.subnets || []
      );

      // Extraer arrays de información adicional
      const additionalInfo = this._extractAdditionalInfo(subnetStructure.subnets, vpcInfo);

      // Construir configuración completa usando información del proyecto
      const configuration = {
        // Usar información extraída del diagrama o valores por defecto
        project_name: projectInfo.project_name || this.defaultConfig.project_name,
        area: projectInfo.area || this.defaultConfig.area,
        ecosistema: projectInfo.ecosistema || this.defaultConfig.ecosistema,
        environment: projectInfo.environment || this.defaultConfig.environment,
        region: vpcInfo.region || this.defaultConfig.region,
        has_internet: this.defaultConfig.has_internet,
        existing_vpc: this.defaultConfig.existing_vpc,
        s3_enable_versioning: this.defaultConfig.s3_enable_versioning,
        ...vpcInfo,
        ...additionalInfo,
        subnets: subnetStructure.subnets,
        route_tables: routeTableStructure.routeTables,
        main_rt: routeTableStructure.mainRouteTable
      };

      // Agregar información adicional del diagrama si está disponible
      if (projectInfo.diagram_title) {
        configuration._diagram_title = projectInfo.diagram_title;
      }
      if (projectInfo.diagram_version) {
        configuration._diagram_version = projectInfo.diagram_version;
      }
      if (projectInfo.creation_date) {
        configuration._creation_date = projectInfo.creation_date;
      }
      if (projectInfo.source) {
        configuration._info_source = projectInfo.source;
      }

      // Validar configuración antes de retornar
      this.validateOutputStructure(configuration);

      return configuration;
    } catch (error) {
      if (error instanceof TerraformGenerationError) {
        throw error;
      }
      throw new TerraformGenerationError(
        'GENERATION_FAILED',
        `Error al generar configuración: ${error.message}`,
        { originalError: error, awsComponents }
      );
    }
  }

  /**
   * Crea la estructura de subnets organizadas por tipo
   * @param {Array} subnets - Array de subnets extraídas
   * @returns {Object} - Estructura de subnets organizada
   */
  createSubnetStructure(subnets) {
    if (!Array.isArray(subnets)) {
      throw new TerraformGenerationError(
        'INVALID_SUBNETS',
        'Las subnets deben ser un array',
        { receivedType: typeof subnets }
      );
    }

    const structure = {
      subnets: {},
      summary: {
        total: subnets.length,
        public: 0,
        private_routable: 0,
        private_non_routable: 0
      }
    };

    subnets.forEach((subnet, index) => {
      try {
        const subnetConfig = this._createSubnetConfig(subnet, index);
        const subnetName = this._generateSubnetName(subnet, index);
        
        structure.subnets[subnetName] = subnetConfig;
        
        // Actualizar contadores
        const type = this._classifySubnetForTerraform(subnet);
        if (structure.summary[type] !== undefined) {
          structure.summary[type]++;
        }
      } catch (error) {
        throw new TerraformGenerationError(
          'SUBNET_PROCESSING_ERROR',
          `Error procesando subnet ${subnet.id || index}: ${error.message}`,
          { subnet, index, originalError: error }
        );
      }
    });

    return structure;
  }

  /**
   * Crea la estructura de route tables y mapeo a subnets
   * @param {Array} routeTables - Array de route tables extraídas
   * @param {Array} subnets - Array de subnets para mapeo
   * @returns {Object} - Estructura de route tables
   */
  createRouteTableStructure(routeTables, subnets) {
    if (!Array.isArray(routeTables)) {
      routeTables = [];
    }
    if (!Array.isArray(subnets)) {
      subnets = [];
    }

    const structure = {
      routeTables: {},
      mainRouteTable: null,
      summary: {
        total: routeTables.length,
        main: 0,
        custom: 0
      }
    };

    // Procesar route tables existentes
    routeTables.forEach((routeTable, index) => {
      try {
        const rtConfig = this._createRouteTableConfig(routeTable, subnets);
        const rtName = this._generateRouteTableName(routeTable, index);
        
        structure.routeTables[rtName] = rtConfig;
        
        // Identificar route table principal
        if (routeTable.isMainRouteTable || routeTable.type === 'main') {
          structure.mainRouteTable = rtName;
          structure.summary.main++;
        } else {
          structure.summary.custom++;
        }
      } catch (error) {
        throw new TerraformGenerationError(
          'ROUTE_TABLE_PROCESSING_ERROR',
          `Error procesando route table ${routeTable.id || index}: ${error.message}`,
          { routeTable, index, originalError: error }
        );
      }
    });

    // Si no hay route table principal definida, crear una por defecto
    if (!structure.mainRouteTable && subnets.length > 0) {
      const defaultMainRT = this._createDefaultMainRouteTable(subnets);
      structure.routeTables['main-rt'] = defaultMainRT;
      structure.mainRouteTable = 'main-rt';
      structure.summary.main++;
      structure.summary.total++;
    }

    return structure;
  }

  /**
   * Valida que la estructura de salida tenga todos los campos requeridos
   * @param {Object} configuration - Configuración a validar
   * @returns {boolean} - true si es válida, lanza error si no
   */
  validateOutputStructure(configuration) {
    if (!configuration || typeof configuration !== 'object') {
      throw new TerraformGenerationError(
        'INVALID_CONFIGURATION',
        'La configuración debe ser un objeto válido'
      );
    }

    // Campos requeridos según especificación
    const requiredFields = [
      'project_name', 'vpc_name', 'area', 'ecosistema', 'environment',
      'region', 'vpc_cidr', 'non_route_cidr', 'has_internet',
      'existing_vpc', 's3_enable_versioning', 'subnets', 'route_tables', 'main_rt'
    ];

    const missingFields = [];
    
    for (const field of requiredFields) {
      if (!(field in configuration)) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      throw new TerraformGenerationError(
        'MISSING_REQUIRED_FIELDS',
        `Faltan campos requeridos en la configuración: ${missingFields.join(', ')}`,
        { missingFields, configuration }
      );
    }

    // Validar tipos de datos específicos
    this._validateFieldTypes(configuration);

    // Validar contenido específico
    this._validateFieldContent(configuration);

    // Validar formato JSON
    this._validateJSONFormat(configuration);

    return true;
  }

  /**
   * Valida el formato JSON de la configuración
   * @param {Object} configuration - Configuración a validar
   * @private
   */
  _validateJSONFormat(configuration) {
    try {
      const jsonString = JSON.stringify(configuration);
      
      // Verificar que el JSON no esté vacío
      if (!jsonString || jsonString.length === 0) {
        throw new TerraformGenerationError(
          'EMPTY_JSON',
          'La configuración genera un JSON vacío'
        );
      }

      // Verificar que se puede parsear de vuelta
      const parsed = JSON.parse(jsonString);
      
      // Verificar que el objeto parseado es equivalente
      if (typeof parsed !== 'object' || parsed === null) {
        throw new TerraformGenerationError(
          'INVALID_JSON_STRUCTURE',
          'El JSON parseado no mantiene la estructura de objeto'
        );
      }

      // Verificar que los campos principales están presentes después del round trip
      const criticalFields = ['project_name', 'vpc_name', 'subnets', 'route_tables'];
      for (const field of criticalFields) {
        if (!(field in parsed)) {
          throw new TerraformGenerationError(
            'JSON_ROUND_TRIP_FAILURE',
            `Campo crítico '${field}' se perdió durante la serialización JSON`,
            { field, originalConfig: configuration, parsedConfig: parsed }
          );
        }
      }

    } catch (error) {
      if (error instanceof TerraformGenerationError) {
        throw error;
      }
      throw new TerraformGenerationError(
        'INVALID_JSON_FORMAT',
        `La configuración no puede ser serializada a JSON válido: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Valida el contenido específico de los campos
   * @param {Object} configuration - Configuración a validar
   * @private
   */
  _validateFieldContent(configuration) {
    // Validar formato CIDR
    this._validateCIDRFields(configuration);
    
    // Validar región AWS
    this._validateAWSRegion(configuration.region);
    
    // Validar estructura de subnets
    this._validateSubnetsStructure(configuration.subnets);
    
    // Validar estructura de route tables
    this._validateRouteTablesStructure(configuration.route_tables);
    
    // Validar referencia a main route table
    this._validateMainRouteTableReference(configuration);
  }

  /**
   * Valida campos CIDR
   * @private
   */
  _validateCIDRFields(configuration) {
    const cidrFields = ['vpc_cidr', 'non_route_cidr'];
    
    for (const field of cidrFields) {
      const cidr = configuration[field];
      if (!this._validateAndFixCIDR(cidr)) {
        throw new TerraformGenerationError(
          'INVALID_CIDR_FORMAT',
          `Campo '${field}' no tiene formato CIDR válido: ${cidr}`,
          { field, value: cidr }
        );
      }
    }

    // Validar que non_route_cidr esté dentro de vpc_cidr
    if (!this._isCIDRWithinRange(configuration.non_route_cidr, configuration.vpc_cidr)) {
      throw new TerraformGenerationError(
        'CIDR_RANGE_MISMATCH',
        `El CIDR no ruteable (${configuration.non_route_cidr}) debe estar dentro del rango del VPC (${configuration.vpc_cidr})`,
        { vpc_cidr: configuration.vpc_cidr, non_route_cidr: configuration.non_route_cidr }
      );
    }
  }

  /**
   * Valida región AWS
   * @private
   */
  _validateAWSRegion(region) {
    const validRegionPattern = /^(us|eu|ap|sa|ca|af|me)-(gov-)?(north|south|east|west|central|northeast|southeast|southwest|northwest|central)-\d$/;
    
    if (!validRegionPattern.test(region)) {
      throw new TerraformGenerationError(
        'INVALID_AWS_REGION',
        `Región AWS no válida: ${region}`,
        { region, expectedPattern: validRegionPattern.toString() }
      );
    }
  }

  /**
   * Valida estructura de subnets
   * @private
   */
  _validateSubnetsStructure(subnets) {
    if (typeof subnets !== 'object' || Array.isArray(subnets)) {
      throw new TerraformGenerationError(
        'INVALID_SUBNETS_STRUCTURE',
        'Las subnets deben ser un objeto, no un array'
      );
    }

    for (const [subnetName, subnetConfig] of Object.entries(subnets)) {
      this._validateSingleSubnet(subnetName, subnetConfig);
    }
  }

  /**
   * Valida una subnet individual
   * @private
   */
  _validateSingleSubnet(name, config) {
    // Campos requeridos para la nueva estructura simplificada de Terraform
    const requiredSubnetFields = ['cidr', 'az', 'tags'];
    
    for (const field of requiredSubnetFields) {
      if (!(field in config)) {
        throw new TerraformGenerationError(
          'MISSING_SUBNET_FIELD',
          `Subnet '${name}' falta campo requerido: ${field}`,
          { subnetName: name, missingField: field, config }
        );
      }
    }

    // Validar CIDR de subnet
    if (!this._validateAndFixCIDR(config.cidr)) {
      throw new TerraformGenerationError(
        'INVALID_SUBNET_CIDR',
        `Subnet '${name}' tiene CIDR inválido: ${config.cidr}`,
        { subnetName: name, cidr: config.cidr }
      );
    }

    // Validar que az (availability zone) sea una string válida
    if (!config.az || typeof config.az !== 'string') {
      throw new TerraformGenerationError(
        'INVALID_AVAILABILITY_ZONE',
        `Subnet '${name}' tiene zona de disponibilidad inválida: ${config.az}`,
        { subnetName: name, az: config.az }
      );
    }

    // Validar que tags sea un objeto
    if (!config.tags || typeof config.tags !== 'object' || Array.isArray(config.tags)) {
      throw new TerraformGenerationError(
        'INVALID_SUBNET_TAGS',
        `Subnet '${name}' debe tener tags como objeto`,
        { subnetName: name, tags: config.tags }
      );
    }
  }

  /**
   * Valida estructura de route tables
   * @private
   */
  _validateRouteTablesStructure(routeTables) {
    if (typeof routeTables !== 'object' || Array.isArray(routeTables)) {
      throw new TerraformGenerationError(
        'INVALID_ROUTE_TABLES_STRUCTURE',
        'Las route tables deben ser un objeto, no un array'
      );
    }

    for (const [rtName, rtConfig] of Object.entries(routeTables)) {
      this._validateSingleRouteTable(rtName, rtConfig);
    }
  }

  /**
   * Valida una route table individual
   * @private
   */
  _validateSingleRouteTable(name, config) {
    const requiredRTFields = ['routes', 'associated_subnets', 'tags'];
    
    for (const field of requiredRTFields) {
      if (!(field in config)) {
        throw new TerraformGenerationError(
          'MISSING_ROUTE_TABLE_FIELD',
          `Route table '${name}' falta campo requerido: ${field}`,
          { routeTableName: name, missingField: field, config }
        );
      }
    }

    // Validar que routes es un array
    if (!Array.isArray(config.routes)) {
      throw new TerraformGenerationError(
        'INVALID_ROUTES_TYPE',
        `Route table '${name}' debe tener routes como array`,
        { routeTableName: name, routesType: typeof config.routes }
      );
    }

    // Validar que associated_subnets es un array
    if (!Array.isArray(config.associated_subnets)) {
      throw new TerraformGenerationError(
        'INVALID_ASSOCIATED_SUBNETS_TYPE',
        `Route table '${name}' debe tener associated_subnets como array`,
        { routeTableName: name, associatedSubnetsType: typeof config.associated_subnets }
      );
    }

    // Validar cada ruta
    config.routes.forEach((route, index) => {
      this._validateSingleRoute(name, route, index);
    });
  }

  /**
   * Valida una ruta individual
   * @private
   */
  _validateSingleRoute(routeTableName, route, index) {
    const requiredRouteFields = ['destination', 'target', 'type'];
    
    for (const field of requiredRouteFields) {
      if (!(field in route)) {
        throw new TerraformGenerationError(
          'MISSING_ROUTE_FIELD',
          `Ruta ${index} en route table '${routeTableName}' falta campo: ${field}`,
          { routeTableName, routeIndex: index, missingField: field, route }
        );
      }
    }

    // Validar formato de destination (debe ser CIDR o 0.0.0.0/0)
    if (route.destination !== '0.0.0.0/0' && !this._validateAndFixCIDR(route.destination)) {
      throw new TerraformGenerationError(
        'INVALID_ROUTE_DESTINATION',
        `Ruta ${index} en route table '${routeTableName}' tiene destination inválido: ${route.destination}`,
        { routeTableName, routeIndex: index, destination: route.destination }
      );
    }
  }

  /**
   * Valida referencia a main route table
   * @private
   */
  _validateMainRouteTableReference(configuration) {
    if (configuration.main_rt && !configuration.route_tables[configuration.main_rt]) {
      throw new TerraformGenerationError(
        'INVALID_MAIN_RT_REFERENCE',
        `La main route table '${configuration.main_rt}' no existe en route_tables`,
        { mainRT: configuration.main_rt, availableRTs: Object.keys(configuration.route_tables) }
      );
    }
  }

  /**
   * Serializa la configuración a JSON con formato legible
   * @param {Object} configuration - Configuración a serializar
   * @param {number} indent - Número de espacios para indentación (default: 2)
   * @returns {string} - JSON formateado
   */
  serializeToJSON(configuration, indent = 2) {
    if (!configuration || typeof configuration !== 'object') {
      throw new TerraformGenerationError(
        'INVALID_SERIALIZATION_INPUT',
        'La configuración debe ser un objeto válido para serialización'
      );
    }

    const serializationAttempts = [];
    let lastError = null;

    try {
      // Validar antes de serializar
      this.validateOutputStructure(configuration);
      
      // Intento 1: Serialización directa
      try {
        const jsonString = JSON.stringify(configuration, null, indent);
        
        if (!jsonString || jsonString.length === 0) {
          throw new Error('La serialización produjo un resultado vacío');
        }

        serializationAttempts.push({
          attempt: 1,
          method: 'direct',
          success: true,
          size: jsonString.length
        });

        return jsonString;
      } catch (directError) {
        lastError = directError;
        serializationAttempts.push({
          attempt: 1,
          method: 'direct',
          success: false,
          error: directError.message
        });

        // Intento 2: Serialización con limpieza de valores no serializables
        try {
          const cleanedConfig = this._cleanNonSerializableValues(configuration);
          const jsonString = JSON.stringify(cleanedConfig, null, indent);
          
          if (!jsonString || jsonString.length === 0) {
            throw new Error('La serialización con limpieza produjo un resultado vacío');
          }

          serializationAttempts.push({
            attempt: 2,
            method: 'cleaned',
            success: true,
            size: jsonString.length,
            warning: 'Se eliminaron valores no serializables'
          });

          return jsonString;
        } catch (cleanedError) {
          lastError = cleanedError;
          serializationAttempts.push({
            attempt: 2,
            method: 'cleaned',
            success: false,
            error: cleanedError.message
          });

          // Intento 3: Serialización de estado simplificado
          try {
            const simplifiedState = this._createSimplifiedState(configuration);
            const jsonString = JSON.stringify(simplifiedState, null, indent);
            
            serializationAttempts.push({
              attempt: 3,
              method: 'simplified',
              success: true,
              size: jsonString.length,
              warning: 'Se usó estado simplificado debido a errores de serialización'
            });

            return jsonString;
          } catch (simplifiedError) {
            lastError = simplifiedError;
            serializationAttempts.push({
              attempt: 3,
              method: 'simplified',
              success: false,
              error: simplifiedError.message
            });
          }
        }
      }

      // Si todos los intentos fallaron, lanzar error con información detallada
      const errorInfo = this.handleSerializationError(lastError, {
        configuration,
        serializationAttempts
      });

      throw new TerraformGenerationError(
        'SERIALIZATION_FAILED',
        `Falló la serialización después de ${serializationAttempts.length} intentos: ${lastError.message}`,
        errorInfo
      );

    } catch (error) {
      if (error instanceof TerraformGenerationError) {
        throw error;
      }
      
      const errorInfo = this.handleSerializationError(error, {
        configuration,
        serializationAttempts
      });

      throw new TerraformGenerationError(
        'SERIALIZATION_ERROR',
        `Error durante la serialización: ${error.message}`,
        errorInfo
      );
    }
  }

  /**
   * Pretty printer para validar la estructura JSON de salida
   * @param {string} jsonString - String JSON a formatear
   * @returns {Object} - Objeto con JSON formateado y metadatos
   */
  prettyPrintJSON(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
      throw new TerraformGenerationError(
        'INVALID_PRETTY_PRINT_INPUT',
        'El input debe ser un string JSON válido'
      );
    }

    try {
      // Parsear el JSON para validar
      const parsed = JSON.parse(jsonString);
      
      // Generar versión formateada
      const formatted = JSON.stringify(parsed, null, 2);
      
      // Generar metadatos
      const metadata = this._generateJSONMetadata(parsed, jsonString);
      
      return {
        formatted: formatted,
        original: jsonString,
        parsed: parsed,
        metadata: metadata,
        isValid: true
      };
    } catch (error) {
      throw new TerraformGenerationError(
        'PRETTY_PRINT_ERROR',
        `Error al formatear JSON: ${error.message}`,
        { originalError: error, input: jsonString.substring(0, 200) }
      );
    }
  }

  /**
   * Valida round trip de serialización (serialize -> parse -> serialize)
   * @param {Object} originalConfiguration - Configuración original
   * @returns {Object} - Resultado de la validación round trip
   */
  validateRoundTrip(originalConfiguration) {
    if (!originalConfiguration || typeof originalConfiguration !== 'object') {
      throw new TerraformGenerationError(
        'INVALID_ROUND_TRIP_INPUT',
        'La configuración original debe ser un objeto válido'
      );
    }

    try {
      // Paso 1: Serializar configuración original
      const serialized = this.serializeToJSON(originalConfiguration);
      
      // Paso 2: Parsear JSON serializado
      const parsed = JSON.parse(serialized);
      
      // Paso 3: Serializar nuevamente
      const reSerialized = this.serializeToJSON(parsed);
      
      // Paso 4: Comparar resultados
      const isIdentical = serialized === reSerialized;
      const structurallyEqual = this._deepEqual(originalConfiguration, parsed);
      
      return {
        success: isIdentical && structurallyEqual,
        originalConfiguration: originalConfiguration,
        serialized: serialized,
        parsed: parsed,
        reSerialized: reSerialized,
        isIdentical: isIdentical,
        structurallyEqual: structurallyEqual,
        differences: isIdentical ? [] : this._findDifferences(serialized, reSerialized)
      };
    } catch (error) {
      if (error instanceof TerraformGenerationError) {
        throw error;
      }
      throw new TerraformGenerationError(
        'ROUND_TRIP_VALIDATION_ERROR',
        `Error durante validación round trip: ${error.message}`,
        { originalError: error, originalConfiguration }
      );
    }
  }

  /**
   * Genera metadatos sobre el JSON
   * @private
   */
  _generateJSONMetadata(parsed, originalString) {
    const metadata = {
      size: {
        originalBytes: originalString.length,
        formattedLines: JSON.stringify(parsed, null, 2).split('\n').length,
        objectKeys: this._countObjectKeys(parsed),
        arrayElements: this._countArrayElements(parsed)
      },
      structure: {
        hasRequiredFields: this._checkRequiredFields(parsed),
        subnetCount: Object.keys(parsed.subnets || {}).length,
        routeTableCount: Object.keys(parsed.route_tables || {}).length,
        totalRoutes: this._countTotalRoutes(parsed.route_tables || {})
      },
      validation: {
        hasValidCIDRs: this._validateAllCIDRs(parsed),
        hasConsistentTypes: this._validateConsistentTypes(parsed),
        hasValidReferences: this._validateReferences(parsed)
      }
    };

    return metadata;
  }

  /**
   * Cuenta claves de objeto recursivamente
   * @private
   */
  _countObjectKeys(obj, count = 0) {
    if (typeof obj !== 'object' || obj === null) {
      return count;
    }

    if (Array.isArray(obj)) {
      return obj.reduce((acc, item) => acc + this._countObjectKeys(item), count);
    }

    const keys = Object.keys(obj);
    return keys.reduce((acc, key) => acc + this._countObjectKeys(obj[key]), count + keys.length);
  }

  /**
   * Cuenta elementos de array recursivamente
   * @private
   */
  _countArrayElements(obj, count = 0) {
    if (typeof obj !== 'object' || obj === null) {
      return count;
    }

    if (Array.isArray(obj)) {
      return obj.reduce((acc, item) => acc + this._countArrayElements(item), count + obj.length);
    }

    return Object.values(obj).reduce((acc, value) => acc + this._countArrayElements(value), count);
  }

  /**
   * Verifica campos requeridos
   * @private
   */
  _checkRequiredFields(parsed) {
    const requiredFields = [
      'project_name', 'vpc_name', 'area', 'ecosistema', 'environment',
      'region', 'vpc_cidr', 'non_route_cidr', 'has_internet',
      'existing_vpc', 's3_enable_versioning', 'subnets', 'route_tables', 'main_rt'
    ];

    return requiredFields.every(field => field in parsed);
  }

  /**
   * Cuenta rutas totales en todas las route tables
   * @private
   */
  _countTotalRoutes(routeTables) {
    return Object.values(routeTables).reduce((total, rt) => {
      return total + (rt.routes ? rt.routes.length : 0);
    }, 0);
  }

  /**
   * Valida todos los CIDRs en la configuración
   * @private
   */
  _validateAllCIDRs(parsed) {
    try {
      // Validar VPC CIDRs
      if (!this._validateAndFixCIDR(parsed.vpc_cidr) || !this._validateAndFixCIDR(parsed.non_route_cidr)) {
        return false;
      }

      // Validar CIDRs de subnets
      for (const subnet of Object.values(parsed.subnets || {})) {
        if (!this._validateAndFixCIDR(subnet.cidr)) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Valida tipos consistentes
   * @private
   */
  _validateConsistentTypes(parsed) {
    try {
      // Verificar estructura de subnets - ahora solo validamos que tengan los campos requeridos
      for (const subnet of Object.values(parsed.subnets || {})) {
        // Verificar que tenga los campos básicos requeridos
        if (!subnet.cidr || !subnet.az || !subnet.tags) {
          return false;
        }
        
        // Verificar que az sea una string válida
        if (typeof subnet.az !== 'string') {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Valida referencias entre objetos
   * @private
   */
  _validateReferences(parsed) {
    try {
      // Verificar que main_rt existe en route_tables
      if (parsed.main_rt && !parsed.route_tables[parsed.main_rt]) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Comparación profunda de objetos
   * @private
   */
  _deepEqual(obj1, obj2) {
    if (obj1 === obj2) {
      return true;
    }

    if (obj1 == null || obj2 == null) {
      return obj1 === obj2;
    }

    if (typeof obj1 !== typeof obj2) {
      return false;
    }

    if (typeof obj1 !== 'object') {
      return obj1 === obj2;
    }

    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
      return false;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      if (!keys2.includes(key)) {
        return false;
      }

      if (!this._deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Encuentra diferencias entre dos strings JSON
   * @private
   */
  _findDifferences(str1, str2) {
    const differences = [];
    const lines1 = str1.split('\n');
    const lines2 = str2.split('\n');
    const maxLines = Math.max(lines1.length, lines2.length);

    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i] || '';
      const line2 = lines2[i] || '';
      
      if (line1 !== line2) {
        differences.push({
          line: i + 1,
          original: line1,
          modified: line2
        });
      }
    }

    return differences;
  }

  /**
   * Extrae información adicional como arrays de CIDRs y zonas de disponibilidad
   * @private
   */
  _extractAdditionalInfo(subnets, vpcInfo) {
    const cidrs = [];
    const availabilityZones = new Set();
    
    // Agregar CIDR del VPC
    if (vpcInfo.vpc_cidr) {
      cidrs.push(vpcInfo.vpc_cidr);
    }
    
    // Agregar CIDR no ruteable
    if (vpcInfo.non_route_cidr) {
      cidrs.push(vpcInfo.non_route_cidr);
    }
    
    // Extraer CIDRs y AZs de las subnets
    Object.values(subnets).forEach(subnet => {
      if (subnet.cidr) {
        cidrs.push(subnet.cidr);
      }
      if (subnet.az) {  // Cambiar de availability_zone a az
        availabilityZones.add(subnet.az);
      }
    });
    
    // Si no hay zonas de disponibilidad, usar las por defecto según requerimientos
    if (availabilityZones.size === 0) {
      availabilityZones.add(`${this.defaultConfig.region}a`);
      availabilityZones.add(`${this.defaultConfig.region}b`);
    }
    
    return {
      cidr_blocks: [...new Set(cidrs)], // Eliminar duplicados
      availability_zones: Array.from(availabilityZones).sort()
    };
  }

  /**
   * Extrae información del VPC de los componentes AWS
   * @private
   */
  _extractVPCInfo(awsComponents) {
    const vpcs = awsComponents.vpcs || [];
    
    if (vpcs.length === 0) {
      // Usar valores por defecto si no hay VPC
      return {
        vpc_name: 'default-vpc',
        vpc_cidr: '10.0.0.0/16',
        non_route_cidr: '10.0.0.0/24'
      };
    }

    // Usar el primer VPC encontrado
    const primaryVpc = vpcs[0];
    const vpcCidr = this._validateAndFixCIDR(primaryVpc.cidr) || '10.0.0.0/16';
    
    return {
      vpc_name: this._cleanName(primaryVpc.name) || 'extracted-vpc',
      vpc_cidr: vpcCidr,
      non_route_cidr: this._calculateNonRouteCIDR(vpcCidr),
      region: primaryVpc.region || this.defaultConfig.region
    };
  }

  /**
   * Crea configuración individual de subnet
   * @private
   */
  _createSubnetConfig(subnet, index) {
    const type = this._classifySubnetForTerraform(subnet);
    
    // Distribuir subnets entre zonas de disponibilidad disponibles según requerimientos
    const availabilityZones = [`${this.defaultConfig.region}a`, `${this.defaultConfig.region}b`];
    
    // Si la subnet no tiene AZ específica o tiene la AZ por defecto, distribuir
    let az = subnet.availabilityZone;
    if (!az || az === `${this.defaultConfig.region}a`) {
      az = availabilityZones[index % availabilityZones.length];
    }
    
    const cidr = this._validateAndFixCIDR(subnet.cidr) || this._generateDefaultCIDR(index);
    
    // Estructura simplificada según la definición de Terraform
    return {
      cidr: cidr,
      az: az,  // Cambiar de 'availability_zone' a 'az'
      tags: {
        Name: this._cleanName(subnet.name) || `subnet-${index + 1}`,
        Type: type,
        Environment: this.defaultConfig.environment
      }
    };
  }

  /**
   * Clasifica subnet para configuración Terraform
   * @private
   */
  _classifySubnetForTerraform(subnet) {
    const text = (subnet.label || subnet.value || '').toLowerCase();
    const subnetType = subnet.type || '';
    
    // Verificar patrones específicos
    if (this.subnetTypePatterns.private_non_routable.test(text) || 
        subnetType === 'private-non-routable') {
      return 'private_nrt';
    }
    
    if (this.subnetTypePatterns.public.test(text) || 
        subnetType === 'public-routable') {
      return 'public-rt';
    }
    
    // Por defecto: private routable
    return 'private_rt';
  }

  /**
   * Genera nombre único para subnet
   * @private
   */
  _generateSubnetName(subnet, index) {
    if (subnet.name && subnet.name.trim()) {
      return this._cleanName(subnet.name);
    }
    
    const type = this._classifySubnetForTerraform(subnet);
    return `subnet-${type}-${index + 1}`;
  }

  /**
   * Crea configuración de route table
   * @private
   */
  _createRouteTableConfig(routeTable, subnets) {
    const associatedSubnets = this._findAssociatedSubnets(routeTable, subnets);
    
    return {
      routes: this._processRoutes(routeTable.routes || []),
      associated_subnets: associatedSubnets,
      tags: {
        Name: routeTable.name || 'route-table',
        Type: routeTable.type || 'custom',
        Environment: this.defaultConfig.environment
      }
    };
  }

  /**
   * Genera nombre para route table
   * @private
   */
  _generateRouteTableName(routeTable, index) {
    if (routeTable.name && routeTable.name.trim()) {
      return this._cleanName(routeTable.name);
    }
    
    if (routeTable.isMainRouteTable || routeTable.type === 'main') {
      return 'main-rt';
    }
    
    return `custom-rt-${index + 1}`;
  }

  /**
   * Encuentra subnets asociadas a una route table
   * @private
   */
  _findAssociatedSubnets(routeTable, subnets) {
    const associated = [];
    
    // Buscar por IDs asociados
    if (routeTable.associatedSubnets && Array.isArray(routeTable.associatedSubnets)) {
      associated.push(...routeTable.associatedSubnets);
    }
    
    // Buscar subnets que referencien esta route table
    subnets.forEach(subnet => {
      if (subnet.routeTableId === routeTable.id) {
        associated.push(subnet.id);
      }
    });
    
    return [...new Set(associated)]; // Eliminar duplicados
  }

  /**
   * Procesa rutas de una route table
   * @private
   */
  _processRoutes(routes) {
    if (!Array.isArray(routes)) {
      return [];
    }
    
    return routes.map(route => ({
      destination: route.destination || '0.0.0.0/0',
      target: route.target || route.gateway || 'igw',
      type: route.type || 'static'
    }));
  }

  /**
   * Crea route table principal por defecto
   * @private
   */
  _createDefaultMainRouteTable(subnets) {
    return {
      routes: [
        {
          destination: '0.0.0.0/0',
          target: 'igw',
          type: 'static'
        }
      ],
      associated_subnets: subnets.map(subnet => subnet.id).filter(Boolean),
      tags: {
        Name: 'main-route-table',
        Type: 'main',
        Environment: this.defaultConfig.environment
      }
    };
  }

  /**
   * Calcula CIDR para subnets no ruteables
   * @private
   */
  _calculateNonRouteCIDR(vpcCidr) {
    try {
      const [ip, mask] = vpcCidr.split('/');
      const maskNum = parseInt(mask, 10);
      
      // Incrementar máscara para subnet más pequeña
      const newMask = Math.min(maskNum + 8, 30);
      return `${ip}/${newMask}`;
    } catch {
      return '10.0.0.0/24'; // Fallback
    }
  }

  /**
   * Genera CIDR por defecto para subnet
   * @private
   */
  _generateDefaultCIDR(index) {
    const subnet = index + 1;
    return `10.0.${subnet}.0/24`;
  }

  /**
   * Valida tipos de datos de campos específicos
   * @private
   */
  _validateFieldTypes(configuration) {
    const typeValidations = {
      project_name: 'string',
      vpc_name: 'string',
      area: 'string',
      ecosistema: 'string',
      environment: 'string',
      region: 'string',
      vpc_cidr: 'string',
      non_route_cidr: 'string',
      has_internet: 'boolean',
      s3_enable_versioning: 'string',
      subnets: 'object',
      route_tables: 'object',
      cidr_blocks: 'object', // Array se valida como object en typeof
      availability_zones: 'object' // Array se valida como object en typeof
    };

    for (const [field, expectedType] of Object.entries(typeValidations)) {
      const value = configuration[field];
      const actualType = typeof value;
      
      if (actualType !== expectedType) {
        throw new TerraformGenerationError(
          'INVALID_FIELD_TYPE',
          `Campo '${field}' debe ser de tipo '${expectedType}', pero es '${actualType}'`,
          { field, expectedType, actualType, value }
        );
      }
    }

    // Validaciones específicas adicionales
    if (configuration.subnets && typeof configuration.subnets === 'object') {
      if (Array.isArray(configuration.subnets)) {
        throw new TerraformGenerationError(
          'INVALID_SUBNETS_TYPE',
          'El campo subnets debe ser un objeto, no un array'
        );
      }
    }

    if (configuration.route_tables && typeof configuration.route_tables === 'object') {
      if (Array.isArray(configuration.route_tables)) {
        throw new TerraformGenerationError(
          'INVALID_ROUTE_TABLES_TYPE',
          'El campo route_tables debe ser un objeto, no un array'
        );
      }
    }

    // Validar que cidr_blocks sea un array
    if (configuration.cidr_blocks && !Array.isArray(configuration.cidr_blocks)) {
      throw new TerraformGenerationError(
        'INVALID_CIDR_BLOCKS_TYPE',
        'El campo cidr_blocks debe ser un array'
      );
    }

    // Validar que availability_zones sea un array
    if (configuration.availability_zones && !Array.isArray(configuration.availability_zones)) {
      throw new TerraformGenerationError(
        'INVALID_AVAILABILITY_ZONES_TYPE',
        'El campo availability_zones debe ser un array'
      );
    }
  }

  /**
   * Limpia nombres para uso en Terraform
   * @private
   */
  _cleanName(name) {
    if (!name || typeof name !== 'string') {
      return null;
    }
    
    return name.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Valida y corrige formato CIDR
   * @private
   */
  _validateAndFixCIDR(cidr) {
    if (!cidr || typeof cidr !== 'string') {
      return null;
    }

    // Verificar formato básico
    const cidrPattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
    const match = cidr.match(cidrPattern);
    
    if (!match) {
      return null;
    }

    const [, a, b, c, d, mask] = match;
    const octets = [parseInt(a), parseInt(b), parseInt(c), parseInt(d)];
    const maskNum = parseInt(mask);

    // Validar octetos (0-255)
    if (octets.some(octet => octet < 0 || octet > 255)) {
      return null;
    }

    // Validar máscara (0-32)
    if (maskNum < 0 || maskNum > 32) {
      return null;
    }

    return cidr;
  }

  /**
   * Verifica si un CIDR está dentro del rango de otro CIDR
   * @private
   */
  _isCIDRWithinRange(subnetCidr, vpcCidr) {
    try {
      const [subnetIp, subnetMask] = subnetCidr.split('/');
      const [vpcIp, vpcMask] = vpcCidr.split('/');
      
      const subnetMaskNum = parseInt(subnetMask);
      const vpcMaskNum = parseInt(vpcMask);
      
      // La máscara del subnet debe ser mayor o igual que la del VPC
      if (subnetMaskNum < vpcMaskNum) {
        return false;
      }
      
      // Convertir IPs a números para comparación
      const subnetIpNum = this._ipToNumber(subnetIp);
      const vpcIpNum = this._ipToNumber(vpcIp);
      
      // Calcular la máscara de red del VPC
      const vpcNetworkMask = (0xFFFFFFFF << (32 - vpcMaskNum)) >>> 0;
      
      // Verificar que ambas IPs están en la misma red cuando se aplica la máscara del VPC
      return (subnetIpNum & vpcNetworkMask) === (vpcIpNum & vpcNetworkMask);
    } catch {
      return false;
    }
  }

  /**
   * Convierte una IP string a número
   * @private
   */
  _ipToNumber(ip) {
    const octets = ip.split('.').map(octet => parseInt(octet, 10));
    return (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
  }

  /**
   * Maneja errores de serialización con recuperación de estado
   * @param {Error} error - Error original
   * @param {Object} context - Contexto del error
   * @returns {Object} - Información del error con estado preservado
   */
  handleSerializationError(error, context = {}) {
    const errorInfo = {
      timestamp: new Date().toISOString(),
      errorType: error.name || 'UnknownError',
      message: error.message,
      context: context,
      recoveryOptions: [],
      preservedState: null,
      serializationAttempts: []
    };

    // Preservar estado si es posible con múltiples estrategias
    if (context.configuration && typeof context.configuration === 'object') {
      errorInfo.preservedState = this._preserveStateWithFallbacks(context.configuration);
    }

    // Registrar intentos de serialización fallidos
    if (context.serializationAttempts) {
      errorInfo.serializationAttempts = context.serializationAttempts;
    }

    // Generar opciones de recuperación basadas en el tipo de error
    if (error instanceof TerraformGenerationError) {
      errorInfo.recoveryOptions = this._generateRecoveryOptions(error);
    } else {
      errorInfo.recoveryOptions = [
        'Verificar que la configuración sea un objeto válido',
        'Revisar que todos los campos requeridos estén presentes',
        'Validar formato de CIDRs y otros campos específicos',
        'Intentar serialización con configuración simplificada'
      ];
    }

    // Agregar información específica de serialización
    if (error.message && error.message.includes('JSON')) {
      errorInfo.serializationSpecific = {
        likelyCircularReference: this._detectCircularReferences(context.configuration),
        hasNonSerializableValues: this._detectNonSerializableValues(context.configuration),
        suggestedFixes: this._generateSerializationFixes(context.configuration)
      };
    }

    return errorInfo;
  }

  /**
   * Intenta recuperar de errores de generación
   * @param {Object} awsComponents - Componentes AWS originales
   * @param {Object} errorInfo - Información del error
   * @returns {Object} - Configuración recuperada o error
   */
  attemptErrorRecovery(awsComponents, errorInfo) {
    const recoveryAttempts = [];
    let lastError = null;

    try {
      // Estrategia 1: Usar valores por defecto para campos faltantes
      try {
        const sanitizedComponents = this._sanitizeAWSComponents(awsComponents);
        const minimalConfig = this._generateMinimalConfiguration(sanitizedComponents);
        
        // Intentar validar configuración recuperada
        this.validateOutputStructure(minimalConfig);
        
        // Intentar serializar para verificar que funciona
        const testSerialization = this.serializeToJSON(minimalConfig);
        
        recoveryAttempts.push({
          strategy: 'sanitization_and_defaults',
          success: true,
          configSize: Object.keys(minimalConfig).length,
          serializationSize: testSerialization.length
        });

        return {
          success: true,
          configuration: minimalConfig,
          recoveryMethod: 'sanitization_and_defaults',
          warnings: this._generateRecoveryWarnings(awsComponents, sanitizedComponents),
          recoveryAttempts: recoveryAttempts
        };
      } catch (sanitizationError) {
        lastError = sanitizationError;
        recoveryAttempts.push({
          strategy: 'sanitization_and_defaults',
          success: false,
          error: sanitizationError.message
        });

        // Estrategia 2: Configuración mínima absoluta
        try {
          const fallbackConfig = this._generateFallbackConfiguration();
          
          // Validar configuración de fallback
          this.validateOutputStructure(fallbackConfig);
          
          // Verificar serialización
          const testSerialization = this.serializeToJSON(fallbackConfig);
          
          recoveryAttempts.push({
            strategy: 'fallback_configuration',
            success: true,
            configSize: Object.keys(fallbackConfig).length,
            serializationSize: testSerialization.length
          });

          return {
            success: true,
            configuration: fallbackConfig,
            recoveryMethod: 'fallback_configuration',
            warnings: [
              'Se usó configuración de fallback debido a errores en los datos originales',
              'La configuración generada es mínima y puede requerir ajustes manuales'
            ],
            recoveryAttempts: recoveryAttempts
          };
        } catch (fallbackError) {
          lastError = fallbackError;
          recoveryAttempts.push({
            strategy: 'fallback_configuration',
            success: false,
            error: fallbackError.message
          });

          // Estrategia 3: Estado preservado del error original
          try {
            if (errorInfo.preservedState && !errorInfo.preservedState.error) {
              const preservedConfig = this._expandPreservedState(errorInfo.preservedState);
              
              recoveryAttempts.push({
                strategy: 'preserved_state_expansion',
                success: true,
                configSize: Object.keys(preservedConfig).length
              });

              return {
                success: true,
                configuration: preservedConfig,
                recoveryMethod: 'preserved_state_expansion',
                warnings: [
                  'Se recuperó configuración desde estado preservado',
                  'La configuración puede estar incompleta'
                ],
                recoveryAttempts: recoveryAttempts,
                originalPreservedState: errorInfo.preservedState
              };
            }
          } catch (preservedError) {
            lastError = preservedError;
            recoveryAttempts.push({
              strategy: 'preserved_state_expansion',
              success: false,
              error: preservedError.message
            });
          }
        }
      }

      // Si todas las estrategias fallaron
      return {
        success: false,
        error: `Todas las estrategias de recuperación fallaron. Último error: ${lastError.message}`,
        originalError: errorInfo,
        recoveryAttempts: recoveryAttempts,
        fallbackConfiguration: {
          ...this.defaultConfig,
          vpc_name: 'emergency-fallback',
          vpc_cidr: '10.0.0.0/16',
          non_route_cidr: '10.0.0.0/24',
          subnets: {},
          route_tables: {},
          main_rt: null,
          _emergency_fallback: true,
          _timestamp: new Date().toISOString(),
          _recovery_failed: true
        }
      };
    } catch (recoveryError) {
      return {
        success: false,
        error: `Error crítico durante recuperación: ${recoveryError.message}`,
        originalError: errorInfo,
        recoveryError: recoveryError.message,
        recoveryAttempts: recoveryAttempts
      };
    }
  }

  /**
   * Crea estado simplificado para preservación
   * @private
   */
  _createSimplifiedState(configuration) {
    return {
      project_name: configuration.project_name || 'unknown',
      vpc_name: configuration.vpc_name || 'unknown',
      region: configuration.region || 'us-east-1',
      subnet_count: Object.keys(configuration.subnets || {}).length,
      route_table_count: Object.keys(configuration.route_tables || {}).length,
      has_main_rt: !!configuration.main_rt
    };
  }

  /**
   * Preserva estado con múltiples estrategias de fallback
   * @private
   */
  _preserveStateWithFallbacks(configuration) {
    const preservationStrategies = [
      () => this._createSimplifiedState(configuration),
      () => this._createMinimalState(configuration),
      () => this._createBasicState(configuration)
    ];

    for (let i = 0; i < preservationStrategies.length; i++) {
      try {
        const preserved = preservationStrategies[i]();
        // Verificar que el estado preservado sea serializable
        JSON.stringify(preserved);
        
        // Retornar el estado directamente para mantener compatibilidad con tests
        return preserved;
      } catch (error) {
        if (i === preservationStrategies.length - 1) {
          return {
            error: 'No se pudo preservar el estado con ninguna estrategia',
            lastError: error.message,
            project_name: 'unknown',
            subnet_count: 0,
            route_table_count: 0
          };
        }
      }
    }
  }

  /**
   * Crea estado mínimo con solo información crítica
   * @private
   */
  _createMinimalState(configuration) {
    return {
      timestamp: new Date().toISOString(),
      project_name: configuration.project_name || 'unknown',
      vpc_name: configuration.vpc_name || 'unknown',
      region: configuration.region || 'us-east-1',
      subnet_count: this._safeCount(configuration.subnets),
      route_table_count: this._safeCount(configuration.route_tables),
      has_main_rt: !!(configuration.main_rt)
    };
  }

  /**
   * Crea estado básico con información mínima
   * @private
   */
  _createBasicState(configuration) {
    return {
      timestamp: new Date().toISOString(),
      project_name: 'basic-fallback',
      vpc_name: 'basic-vpc',
      region: 'us-east-1',
      subnet_count: 0,
      route_table_count: 0,
      has_main_rt: false,
      type: 'terraform_configuration',
      isValid: typeof configuration === 'object' && configuration !== null
    };
  }

  /**
   * Cuenta elementos de forma segura
   * @private
   */
  _safeCount(obj) {
    try {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return Object.keys(obj).length;
      }
      if (Array.isArray(obj)) {
        return obj.length;
      }
      return 0;
    } catch {
      return -1; // Indica error en el conteo
    }
  }

  /**
   * Detecta referencias circulares en el objeto
   * @private
   */
  _detectCircularReferences(obj, visited = new WeakSet()) {
    try {
      if (obj === null || typeof obj !== 'object') {
        return false;
      }

      if (visited.has(obj)) {
        return true;
      }

      visited.add(obj);

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (this._detectCircularReferences(obj[key], visited)) {
            return true;
          }
        }
      }

      visited.delete(obj);
      return false;
    } catch {
      return true; // Asumir que hay problema si no se puede verificar
    }
  }

  /**
   * Detecta valores no serializables
   * @private
   */
  _detectNonSerializableValues(obj, path = '') {
    const nonSerializable = [];

    try {
      if (obj === null || obj === undefined) {
        return nonSerializable;
      }

      const type = typeof obj;
      
      // Tipos no serializables
      if (type === 'function' || type === 'symbol' || type === 'bigint') {
        nonSerializable.push({
          path: path || 'root',
          type: type,
          value: String(obj).substring(0, 50)
        });
        return nonSerializable;
      }

      // Objetos especiales no serializables
      if (type === 'object') {
        if (obj instanceof Date && isNaN(obj.getTime())) {
          nonSerializable.push({
            path: path || 'root',
            type: 'invalid_date',
            value: String(obj)
          });
        } else if (obj instanceof RegExp) {
          nonSerializable.push({
            path: path || 'root',
            type: 'regexp',
            value: String(obj)
          });
        } else if (ArrayBuffer && obj instanceof ArrayBuffer) {
          nonSerializable.push({
            path: path || 'root',
            type: 'arraybuffer',
            value: '[ArrayBuffer]'
          });
        } else if (obj.constructor && obj.constructor.name !== 'Object' && obj.constructor.name !== 'Array') {
          // Instancias de clases personalizadas
          nonSerializable.push({
            path: path || 'root',
            type: 'custom_class',
            value: obj.constructor.name
          });
        }

        // Recursión para propiedades
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            const itemPath = path ? `${path}[${index}]` : `[${index}]`;
            nonSerializable.push(...this._detectNonSerializableValues(item, itemPath));
          });
        } else {
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              const keyPath = path ? `${path}.${key}` : key;
              nonSerializable.push(...this._detectNonSerializableValues(obj[key], keyPath));
            }
          }
        }
      }

      return nonSerializable;
    } catch (error) {
      nonSerializable.push({
        path: path || 'root',
        type: 'detection_error',
        value: error.message
      });
      return nonSerializable;
    }
  }

  /**
   * Genera sugerencias para arreglar problemas de serialización
   * @private
   */
  _generateSerializationFixes(configuration) {
    const fixes = [];

    try {
      // Verificar referencias circulares
      if (this._detectCircularReferences(configuration)) {
        fixes.push({
          issue: 'circular_references',
          fix: 'Eliminar referencias circulares del objeto',
          priority: 'high'
        });
      }

      // Verificar valores no serializables
      const nonSerializable = this._detectNonSerializableValues(configuration);
      if (nonSerializable.length > 0) {
        fixes.push({
          issue: 'non_serializable_values',
          fix: `Convertir o eliminar ${nonSerializable.length} valores no serializables`,
          details: nonSerializable.slice(0, 5), // Mostrar solo los primeros 5
          priority: 'high'
        });
      }

      // Verificar tamaño del objeto
      const jsonString = JSON.stringify(configuration);
      if (jsonString.length > 10 * 1024 * 1024) { // 10MB
        fixes.push({
          issue: 'large_object',
          fix: 'Reducir el tamaño del objeto o usar streaming',
          size: `${Math.round(jsonString.length / 1024 / 1024)}MB`,
          priority: 'medium'
        });
      }

      // Verificar profundidad del objeto
      const depth = this._calculateObjectDepth(configuration);
      if (depth > 100) {
        fixes.push({
          issue: 'deep_nesting',
          fix: 'Reducir la profundidad de anidamiento del objeto',
          depth: depth,
          priority: 'medium'
        });
      }

    } catch (error) {
      fixes.push({
        issue: 'analysis_error',
        fix: 'No se pudo analizar el objeto para generar sugerencias',
        error: error.message,
        priority: 'low'
      });
    }

    return fixes;
  }

  /**
   * Limpia valores no serializables del objeto
   * @private
   */
  _cleanNonSerializableValues(obj, visited = new WeakSet()) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Prevenir referencias circulares
    if (typeof obj === 'object' && visited.has(obj)) {
      return '[Circular Reference]';
    }

    const type = typeof obj;

    // Manejar tipos primitivos no serializables
    if (type === 'function') {
      return '[Function]';
    }
    if (type === 'symbol') {
      return obj.toString();
    }
    if (type === 'bigint') {
      return obj.toString();
    }
    if (type === 'undefined') {
      return null;
    }

    // Manejar tipos primitivos serializables
    if (type !== 'object') {
      return obj;
    }

    // Agregar a visited para prevenir ciclos
    visited.add(obj);

    try {
      // Manejar objetos especiales
      if (obj instanceof Date) {
        return isNaN(obj.getTime()) ? null : obj.toISOString();
      }
      if (obj instanceof RegExp) {
        return obj.toString();
      }
      if (ArrayBuffer && obj instanceof ArrayBuffer) {
        return '[ArrayBuffer]';
      }

      // Manejar arrays
      if (Array.isArray(obj)) {
        return obj.map(item => this._cleanNonSerializableValues(item, visited));
      }

      // Manejar objetos planos
      const cleaned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          try {
            cleaned[key] = this._cleanNonSerializableValues(obj[key], visited);
          } catch (error) {
            cleaned[key] = `[Error: ${error.message}]`;
          }
        }
      }

      return cleaned;
    } finally {
      visited.delete(obj);
    }
  }

  /**
   * Calcula la profundidad máxima de un objeto
   * @private
   */
  _calculateObjectDepth(obj, currentDepth = 0) {
    if (obj === null || typeof obj !== 'object' || currentDepth > 200) {
      return currentDepth;
    }

    let maxDepth = currentDepth;

    try {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const depth = this._calculateObjectDepth(obj[key], currentDepth + 1);
          maxDepth = Math.max(maxDepth, depth);
        }
      }
    } catch {
      return currentDepth + 1; // Retornar profundidad actual + 1 si hay error
    }

    return maxDepth;
  }

  /**
   * Genera opciones de recuperación basadas en el tipo de error
   * @private
   */
  _generateRecoveryOptions(error) {
    const options = [];
    
    switch (error.type) {
      case 'INVALID_INPUT':
        options.push('Verificar que awsComponents sea un objeto válido');
        options.push('Asegurar que awsComponents no sea null, undefined o array');
        break;
        
      case 'MISSING_REQUIRED_FIELDS':
        options.push('Agregar campos faltantes a la configuración');
        options.push('Usar generateConfiguration() para crear configuración completa');
        break;
        
      case 'INVALID_CIDR_FORMAT':
        options.push('Verificar formato CIDR (ej: 10.0.0.0/16)');
        options.push('Asegurar que octetos estén en rango 0-255');
        options.push('Verificar que máscara esté en rango 0-32');
        break;
        
      case 'INVALID_JSON_FORMAT':
        options.push('Verificar que no hay referencias circulares');
        options.push('Asegurar que todos los valores son serializables');
        break;
        
      case 'SUBNET_PROCESSING_ERROR':
        options.push('Verificar que las subnets tengan CIDRs válidos');
        options.push('Asegurar que los tipos de subnet sean válidos');
        break;
        
      case 'ROUTE_TABLE_PROCESSING_ERROR':
        options.push('Verificar estructura de route tables');
        options.push('Asegurar que las rutas tengan destinos válidos');
        break;
        
      default:
        options.push('Revisar la documentación de la API');
        options.push('Contactar soporte técnico si el problema persiste');
    }
    
    return options;
  }

  /**
   * Sanitiza componentes AWS para recuperación
   * @private
   */
  _sanitizeAWSComponents(awsComponents) {
    const sanitized = {
      vpcs: [],
      subnets: [],
      routeTables: [],
      services: []
    };

    // Sanitizar VPCs
    if (Array.isArray(awsComponents.vpcs)) {
      sanitized.vpcs = awsComponents.vpcs
        .filter(vpc => vpc && typeof vpc === 'object')
        .map(vpc => ({
          id: vpc.id || 'vpc-default',
          name: this._cleanName(vpc.name) || 'default-vpc',
          cidr: this._validateAndFixCIDR(vpc.cidr) || '10.0.0.0/16',
          region: vpc.region || 'us-east-1'
        }));
    }

    // Sanitizar Subnets
    if (Array.isArray(awsComponents.subnets)) {
      sanitized.subnets = awsComponents.subnets
        .filter(subnet => subnet && typeof subnet === 'object')
        .map((subnet, index) => ({
          id: subnet.id || `subnet-${index + 1}`,
          name: this._cleanName(subnet.name) || `subnet-${index + 1}`,
          cidr: this._validateAndFixCIDR(subnet.cidr) || this._generateDefaultCIDR(index),
          availabilityZone: subnet.availabilityZone || 'us-east-1a',
          type: this._sanitizeSubnetType(subnet.type),
          label: subnet.label || '',
          value: subnet.value || ''
        }));
    }

    // Sanitizar Route Tables
    if (Array.isArray(awsComponents.routeTables)) {
      sanitized.routeTables = awsComponents.routeTables
        .filter(rt => rt && typeof rt === 'object')
        .map((rt, index) => ({
          id: rt.id || `rt-${index + 1}`,
          name: this._cleanName(rt.name) || `route-table-${index + 1}`,
          type: rt.type || 'custom',
          isMainRouteTable: rt.isMainRouteTable || false,
          routes: Array.isArray(rt.routes) ? rt.routes : [],
          associatedSubnets: Array.isArray(rt.associatedSubnets) ? rt.associatedSubnets : []
        }));
    }

    // Sanitizar Services
    if (Array.isArray(awsComponents.services)) {
      sanitized.services = awsComponents.services
        .filter(service => service && typeof service === 'object')
        .map(service => ({
          id: service.id || 'service-default',
          type: service.type || 'ec2',
          name: service.name || 'default-service'
        }));
    }

    return sanitized;
  }

  /**
   * Sanitiza tipo de subnet
   * @private
   */
  _sanitizeSubnetType(type) {
    const validTypes = ['public-routable', 'private-routable', 'private-non-routable'];
    if (validTypes.includes(type)) {
      return type;
    }
    return 'private-routable'; // Default seguro
  }

  /**
   * Genera configuración mínima válida
   * @private
   */
  _generateMinimalConfiguration(sanitizedComponents) {
    // Si no hay componentes, usar configuración por defecto
    if (!sanitizedComponents.vpcs.length && !sanitizedComponents.subnets.length) {
      return {
        ...this.defaultConfig,
        vpc_name: 'default-vpc',
        vpc_cidr: '10.0.0.0/16',
        non_route_cidr: '10.0.0.0/24',
        cidr_blocks: ['10.0.0.0/16', '10.0.0.0/24', '10.0.1.0/24'],
        availability_zones: [`${this.defaultConfig.region}a`, `${this.defaultConfig.region}b`],
        subnets: {
          'default-subnet': {
            cidr: '10.0.1.0/24',
            az: `${this.defaultConfig.region}a`,  // Cambiar de availability_zone a az
            tags: {
              Name: 'default-subnet',
              Type: 'private_routable',
              Environment: this.defaultConfig.environment
            }
          }
        },
        route_tables: {
          'main-rt': {
            routes: [
              {
                destination: '0.0.0.0/0',
                target: 'igw',
                type: 'static'
              }
            ],
            associated_subnets: ['default-subnet'],
            tags: {
              Name: 'main-route-table',
              Type: 'main',
              Environment: this.defaultConfig.environment
            }
          }
        },
        main_rt: 'main-rt'
      };
    }

    // Usar componentes sanitizados
    return this.generateConfiguration(sanitizedComponents);
  }

  /**
   * Genera advertencias de recuperación
   * @private
   */
  _generateRecoveryWarnings(original, sanitized) {
    const warnings = [];
    
    if (original.vpcs?.length !== sanitized.vpcs.length) {
      warnings.push(`Se filtraron ${(original.vpcs?.length || 0) - sanitized.vpcs.length} VPCs inválidos`);
    }
    
    if (original.subnets?.length !== sanitized.subnets.length) {
      warnings.push(`Se filtraron ${(original.subnets?.length || 0) - sanitized.subnets.length} subnets inválidas`);
    }
    
    if (original.routeTables?.length !== sanitized.routeTables.length) {
      warnings.push(`Se filtraron ${(original.routeTables?.length || 0) - sanitized.routeTables.length} route tables inválidas`);
    }

    // Verificar si se usaron valores por defecto
    sanitized.vpcs.forEach(vpc => {
      if (vpc.cidr === '10.0.0.0/16' && (!original.vpcs?.find(v => v.id === vpc.id)?.cidr)) {
        warnings.push(`VPC ${vpc.id}: se usó CIDR por defecto`);
      }
    });

    return warnings;
  }

  /**
   * Expande estado preservado a configuración completa
   * @private
   */
  _expandPreservedState(preservedState) {
    const expandedConfig = {
      ...this.defaultConfig,
      project_name: preservedState.project_name || this.defaultConfig.project_name,
      vpc_name: preservedState.vpc_name || this.defaultConfig.vpc_name || 'recovered-vpc',
      region: preservedState.region || this.defaultConfig.region,
      vpc_cidr: '10.0.0.0/16',
      non_route_cidr: '10.0.0.0/24',
      subnets: {},
      route_tables: {},
      main_rt: null,
      _recovered_from_preserved_state: true,
      _recovery_timestamp: new Date().toISOString()
    };

    // Generar subnets básicas basadas en el conteo preservado
    const subnetCount = preservedState.subnet_count || 1;
    for (let i = 0; i < Math.min(subnetCount, 5); i++) { // Máximo 5 subnets
      const subnetName = `recovered-subnet-${i + 1}`;
      expandedConfig.subnets[subnetName] = {
        cidr: `10.0.${i + 1}.0/24`,
        az: `${expandedConfig.region}a`,  // Cambiar de availability_zone a az
        tags: {
          Name: subnetName,
          Type: 'private_routable',
          Environment: expandedConfig.environment,
          Recovered: 'true'
        }
      };
    }

    // Generar route table principal si se indica que existía
    if (preservedState.has_main_rt) {
      expandedConfig.route_tables['recovered-main-rt'] = {
        routes: [
          {
            destination: '0.0.0.0/0',
            target: 'igw',
            type: 'static'
          }
        ],
        associated_subnets: Object.keys(expandedConfig.subnets),
        tags: {
          Name: 'recovered-main-route-table',
          Type: 'main',
          Environment: expandedConfig.environment,
          Recovered: 'true'
        }
      };
      expandedConfig.main_rt = 'recovered-main-rt';
    }

    return expandedConfig;
  }

  /**
   * Genera configuración de fallback como último recurso
   * @private
   */
  _generateFallbackConfiguration() {
    return {
      ...this.defaultConfig,
      vpc_name: 'fallback-vpc',
      vpc_cidr: '10.0.0.0/16',
      non_route_cidr: '10.0.0.0/24',
      cidr_blocks: ['10.0.0.0/16', '10.0.0.0/24'],
      availability_zones: [`${this.defaultConfig.region}a`, `${this.defaultConfig.region}b`],
      subnets: {},
      route_tables: {},
      main_rt: null,
      _fallback: true,
      _timestamp: new Date().toISOString()
    };
  }
}