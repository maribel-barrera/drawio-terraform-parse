// src/AWSComponentExtractor.js

/**
 * Error personalizado para errores de extracción de componentes AWS
 */
export class AWSExtractionError extends Error {
  constructor(type, message, context = {}) {
    super(message);
    this.name = 'AWSExtractionError';
    this.type = type;
    this.context = context;
  }
}

/**
 * Clase AWSComponentExtractor para identificar y extraer componentes AWS
 * de elementos gráficos de draw.io
 */
export class AWSComponentExtractor {
  constructor() {
    // Patrones para identificar componentes AWS
    this.awsPatterns = {
      vpc: [
        /vpc/i,
        /virtual.*private.*cloud/i,
        /mxgraph\.aws.*vpc/i,
        /gricon=mxgraph\.aws4\.group_vpc/i
      ],
      subnet: [
        /subnet/i,
        /subred/i,
        /mxgraph\.aws.*subnet/i,
        /availability.*zone/i
      ],
      route_table: [
        /rt/i,
        /nrt/i,
        /route-table/i
      ],
      service: [
        /ec2/i,
        /rds/i,
        /ecs/i,
        /ecr/i,
        /s3/i,
        /lambda/i,
        /alb/i,
        /nlb/i,
        /nat/i,
        /mxgraph\.aws/i
      ]
    };

    // Patrones CIDR para extracción de rangos IP (con espacios opcionales)
    this.cidrPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\s*\/\s*\d{1,2}\b/;
    
    // Patrones de región AWS
    this.regionPattern = /\b(?:us|eu|ap|sa|ca|af|me)-(?:gov-)?(?:north|south|east|west|central|northeast|southeast|southwest|northwest|central)-\d\b/i;
    
    // Patrones para identificar tabla de información del proyecto
    this.projectInfoPatterns = {
      title: /diagrama.*arquitectura.*aws/i,
      environment: /desarrollo|calidad|produccion|producción|drp|development|quality|production/i,
      table: /table|tabla/i
    };
  }

  /**
   * Extrae información del proyecto desde la tabla de información del diagrama
   * @param {Array} elements - Array de elementos del diagrama
   * @returns {Object} - Información del proyecto extraída
   */
  extractProjectInfo(elements) {
    if (!Array.isArray(elements)) {
      throw new AWSExtractionError(
        'INVALID_INPUT',
        'Los elementos deben ser un array'
      );
    }

    const projectInfo = {
      project_name: 'aws-project',
      area: 'UDN',
      ecosistema: '0000',
      environment: 'DEV',
      diagram_title: null,
      diagram_version: null,
      creation_date: null,
      source: 'default'
    };

    try {
      // Primero: intentar parsear el alias de cuenta AWS (fuente más confiable)
      // Formato: "Alias Account mx-{prefix}-{area}-{ecosistema}-{project_name}-{environment}"
      const aliasInfo = this._extractFromAccountAlias(elements);
      if (aliasInfo.found) {
        Object.assign(projectInfo, aliasInfo.data);
        projectInfo.source = 'account_alias';
      } else {
        // Buscar tabla de información del proyecto
        const infoTable = this._findProjectInfoTable(elements);
        
        if (infoTable) {
          const extractedInfo = this._parseProjectInfoTable(infoTable);
          
          if (extractedInfo.project_name) {
            projectInfo.project_name = this._cleanProjectName(extractedInfo.project_name);
          }
          if (extractedInfo.environment) {
            projectInfo.environment = this._normalizeEnvironment(extractedInfo.environment);
            projectInfo.area = this._mapEnvironmentToArea(projectInfo.environment);
          }
          if (extractedInfo.ecosistema) {
            projectInfo.ecosistema = this._cleanEcosistema(extractedInfo.ecosistema);
          }
          projectInfo.diagram_title = extractedInfo.diagram_title;
          projectInfo.diagram_version = extractedInfo.diagram_version;
          projectInfo.creation_date = extractedInfo.creation_date;
          projectInfo.source = 'diagram_table';
        } else {
          const fallbackInfo = this._extractProjectInfoFromElements(elements);
          if (fallbackInfo.found) {
            Object.assign(projectInfo, fallbackInfo.data);
            projectInfo.source = 'elements_fallback';
          }
        }
      }
      
      return projectInfo;
    } catch (error) {
      throw new AWSExtractionError(
        'PROJECT_INFO_EXTRACTION_ERROR',
        `Error al extraer información del proyecto: ${error.message}`,
        { originalError: error, elements: elements.length }
      );
    }
  }

  /**
   * Identifica tipos de componentes AWS en elementos gráficos
   * @param {Array} elements - Array de elementos gráficos extraídos del XML
   * @returns {Object} - Objeto con componentes clasificados por tipo
   */
  identifyAWSComponents(elements) {
    if (!Array.isArray(elements)) {
      throw new AWSExtractionError(
        'INVALID_INPUT',
        'Los elementos deben ser un array',
        { receivedType: typeof elements }
      );
    }

    const components = {
      vpcs: [],
      subnets: [],
      services: [],
      unidentified: []
    };

    for (const element of elements) {
      if (!element || typeof element !== 'object') {
        continue;
      }

      const componentType = this._classifyElement(element);
      
      switch (componentType) {
        case 'vpc':
          components.vpcs.push(element);
          break;
        case 'subnet':
          components.subnets.push(element);
          break;
        case 'service':
          components.services.push(element);
          break;
        default:
          components.unidentified.push(element);
      }
    }

    return components;
  }

  /**
   * Extrae información específica de VPC
   * @param {Array} vpcElements - Array de elementos identificados como VPC
   * @returns {Array} - Array de objetos VPC con información extraída
   */
  extractVPCInfo(vpcElements) {
    if (!Array.isArray(vpcElements)) {
      throw new AWSExtractionError(
        'INVALID_VPC_INPUT',
        'Los elementos VPC deben ser un array'
      );
    }

    return vpcElements.map(element => {
      const vpcInfo = {
        id: element.id || this._generateId('vpc'),
        name: this._extractName(element),
        cidr: this._extractCIDR(element),
        region: this._extractRegion(element) || 'us-east-1', // Default según requerimientos
        properties: this._extractProperties(element),
        originalElement: element
      };

      // Validar que al menos tenga nombre o ID
      if (!vpcInfo.name && !vpcInfo.id) {
        throw new AWSExtractionError(
          'INCOMPLETE_VPC_INFO',
          'VPC debe tener al menos un nombre o ID',
          { element }
        );
      }

      return vpcInfo;
    });
  }

  /**
   * Extrae información específica de subnets
   * @param {Array} subnetElements - Array de elementos identificados como subnet
   * @returns {Array} - Array de objetos subnet con información extraída
   */
  extractSubnetInfo(subnetElements) {
    if (!Array.isArray(subnetElements)) {
      throw new AWSExtractionError(
        'INVALID_SUBNET_INPUT',
        'Los elementos subnet deben ser un array'
      );
    }

    return subnetElements.map(element => {
      const subnetInfo = {
        id: element.id || this._generateId('subnet'),
        name: this._extractName(element),
        cidr: this._extractCIDR(element),
        availabilityZone: this._extractAvailabilityZone(element),
        type: this._classifySubnetType(element),
        properties: this._extractProperties(element),
        parentVpcId: this._findParentVpcId(element),
        originalElement: element
      };

      // Validar información mínima requerida
      if (!subnetInfo.name && !subnetInfo.id) {
        throw new AWSExtractionError(
          'INCOMPLETE_SUBNET_INFO',
          'Subnet debe tener al menos un nombre o ID',
          { element }
        );
      }

      return subnetInfo;
    });
  }

  /**
   * Extrae CIDR de subnets con validación mejorada
   * @param {Array} subnetElements - Array de elementos subnet
   * @returns {Array} - Array de objetos con CIDR extraído y validado
   */
  extractSubnetCIDR(subnetElements) {
    if (!Array.isArray(subnetElements)) {
      throw new AWSExtractionError(
        'INVALID_INPUT',
        'Los elementos deben ser un array'
      );
    }

    return subnetElements.map(element => {
      const cidr = this._extractCIDR(element);
      const isValid = this._validateCIDR(cidr);
      
      return {
        elementId: element.id,
        cidr: cidr,
        isValidCIDR: isValid,
        source: this._getCIDRSource(element),
        element: element
      };
    });
  }

  /**
   * Extrae zonas de disponibilidad con mapeo a regiones
   * @param {Array} elements - Array de elementos
   * @returns {Array} - Array de objetos con información de AZ
   */
  extractAvailabilityZones(elements) {
    if (!Array.isArray(elements)) {
      throw new AWSExtractionError(
        'INVALID_INPUT',
        'Los elementos deben ser un array'
      );
    }

    return elements.map(element => {
      const az = this._extractAvailabilityZone(element);
      const region = this._extractRegionFromAZ(az) || this._extractRegion(element);
      
      return {
        elementId: element.id,
        availabilityZone: az,
        region: region,
        isDefaultAZ: az === 'us-east-1a' || az === 'us-east-1b',
        element: element
      };
    });
  }

  /**
   * Preserva nombres y etiquetas con limpieza y normalización
   * @param {Array} elements - Array de elementos
   * @returns {Array} - Array de objetos con nombres preservados
   */
  preserveNamesAndLabels(elements) {
    if (!Array.isArray(elements)) {
      throw new AWSExtractionError(
        'INVALID_INPUT',
        'Los elementos deben ser un array'
      );
    }

    return elements.map(element => {
      const names = {
        elementId: element.id,
        originalName: this._extractName(element),
        cleanedName: this._cleanLabel(this._extractName(element)),
        originalLabel: element.label || element.value || '',
        cleanedLabel: this._cleanLabel(element.label || element.value || ''),
        displayName: this._generateDisplayName(element),
        properties: this._extractNameProperties(element),
        element: element
      };

      return names;
    });
  }

  /**
   * Clasifica tipos de subnet (ruteable vs no ruteable)
   * @param {Object} subnet - Elemento subnet a clasificar
   * @returns {Object} - Información de clasificación del subnet
   */
  classifySubnetType(subnet) {
    if (!subnet || typeof subnet !== 'object') {
      throw new AWSExtractionError(
        'INVALID_SUBNET',
        'El subnet debe ser un objeto válido'
      );
    }

    const classification = {
      elementId: subnet.id,
      type: this._classifySubnetType(subnet),
      isPublic: false,
      isPrivateRoutable: false,
      isPrivateNonRoutable: false,
      routingCapability: 'unknown',
      internetAccess: false,
      reasoning: [],
      element: subnet
    };

    // Determinar características basadas en el tipo
    switch (classification.type) {
      case 'public-routable':
        classification.isPublic = true;
        classification.routingCapability = 'full';
        classification.internetAccess = true;
        classification.reasoning.push('Identificado como subnet público con acceso a internet');
        break;
        
      case 'private-routable':
        classification.isPrivateRoutable = true;
        classification.routingCapability = 'limited';
        classification.internetAccess = false;
        classification.reasoning.push('Identificado como subnet privado con capacidad de enrutamiento');
        break;
        
      case 'private-non-routable':
        classification.isPrivateNonRoutable = true;
        classification.routingCapability = 'none';
        classification.internetAccess = false;
        classification.reasoning.push('Identificado como subnet privado sin capacidad de enrutamiento');
        break;
        
      default:
        classification.reasoning.push('Tipo de subnet no determinado, usando configuración por defecto');
    }

    // Agregar información adicional de análisis
    this._analyzeSubnetProperties(subnet, classification);

    return classification;
  }

  /**
   * Extrae información de tablas de enrutamiento
   * @param {Array} elements - Array de elementos que pueden contener información de routing
   * @returns {Array} - Array de objetos con información de route tables
   */
  extractRouteTableInfo(elements) {
    if (!Array.isArray(elements)) {
      throw new AWSExtractionError(
        'INVALID_INPUT',
        'Los elementos deben ser un array'
      );
    }

    const routeTables = [];
    const subnetRouteMapping = [];

    for (const element of elements) {
      // Identificar elementos que representan route tables
      if (this._isRouteTable(element)) {
        const routeTable = {
          id: element.id || this._generateId('rt'),
          name: this._extractName(element),
          type: this._classifyRouteTableType(element),
          routes: this._extractRoutes(element),
          associatedSubnets: this._findAssociatedSubnets(element, elements),
          isMainRouteTable: this._isMainRouteTable(element),
          properties: this._extractProperties(element),
          element: element
        };
        
        routeTables.push(routeTable);
      }

      // Mapear subnets a route tables
      if (this._isSubnet(element)) {
        const mapping = {
          subnetId: element.id,
          routeTableId: this._findRouteTableForSubnet(element, elements),
          routingType: this._classifySubnetType(element),
          element: element
        };
        
        subnetRouteMapping.push(mapping);
      }
    }

    return {
      routeTables: routeTables,
      subnetRouteMapping: subnetRouteMapping,
      summary: {
        totalRouteTables: routeTables.length,
        mainRouteTables: routeTables.filter(rt => rt.isMainRouteTable).length,
        customRouteTables: routeTables.filter(rt => !rt.isMainRouteTable).length,
        mappedSubnets: subnetRouteMapping.length
      }
    };
  }

  /**
   * Busca la tabla de información del proyecto en los elementos
   * @private
   */
  _findProjectInfoTable(elements) {
    // Buscar elementos que puedan ser la tabla de información
    const candidates = elements.filter(element => {
      if (!element || !element.label && !element.value) {
        return false;
      }
      
      const text = (element.label || element.value || '').toLowerCase();
      const style = (element.style || '').toLowerCase();
      
      // Buscar indicadores de tabla de información
      return (
        // Contiene título del diagrama
        this.projectInfoPatterns.title.test(text) ||
        // Es una tabla o contiene información estructurada
        style.includes('table') ||
        style.includes('swimlane') ||
        // Contiene múltiples líneas con información del proyecto
        (text.includes('\n') && (
          text.includes('proyecto') ||
          text.includes('ambiente') ||
          text.includes('version') ||
          text.includes('fecha') ||
          text.includes('ieeco')
        ))
      );
    });
    
    // Si encontramos candidatos, buscar también elementos relacionados de la tabla
    if (candidates.length > 0) {
      // Buscar todos los elementos que puedan ser parte de la tabla
      const tableElements = elements.filter(element => {
        const text = (element.label || element.value || '').toLowerCase();
        const style = (element.style || '').toLowerCase();
        
        return (
          // Es parte de una tabla
          style.includes('table') ||
          style.includes('partialrectangle') ||
          // Contiene información del proyecto
          text.includes('proyecto') ||
          text.includes('ambiente') ||
          text.includes('version') ||
          text.includes('fecha') ||
          text.includes('ieeco') ||
          text.includes('produccion') ||
          text.includes('desarrollo') ||
          text.includes('calidad') ||
          text.includes('drp') ||
          // Patrones de fecha
          /\d{1,2}\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}/i.test(text) ||
          /\d{1,2}\/\d{1,2}\/\d{4}/.test(text) ||
          // Patrones de versión
          /version\s*\d+\.\d+/i.test(text) ||
          /v\s*\d+\.\d+/i.test(text)
        );
      });
      
      // Crear un objeto combinado con toda la información de la tabla
      const combinedInfo = {
        id: 'combined-table',
        label: '',
        value: '',
        elements: tableElements
      };
      
      // Combinar todo el texto de los elementos de la tabla
      const allText = tableElements
        .map(el => el.label || el.value || '')
        .filter(text => text && text.trim() && text.trim() !== 'N/A')
        .join('\n');
      
      combinedInfo.label = allText;
      combinedInfo.value = allText;
      
      return combinedInfo;
    }
    
    return null;
  }

  /**
   * Parsea la tabla de información del proyecto
   * @private
   */
  _parseProjectInfoTable(tableElement) {
    const text = tableElement.label || tableElement.value || '';
    const lines = text.split(/\n|\r\n|\r/).map(line => line.trim()).filter(line => line && line !== 'N/A');
    
    const info = {
      diagram_title: null,
      project_name: null,
      environment: null,
      creation_date: null,
      diagram_version: null,
      ecosistema: null
    };
    
    // Procesar cada línea buscando patrones específicos
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Título del diagrama
      if (this.projectInfoPatterns.title.test(line) && !info.diagram_title) {
        info.diagram_title = line;
        continue;
      }
      
      // Nombre del proyecto
      const projectMatch = line.match(/proyecto\s+(.+)/i);
      if (projectMatch && !info.project_name) {
        info.project_name = projectMatch[1].trim();
        continue;
      }
      
      // Ambiente
      const ambientMatch = line.match(/ambiente\s+(.+)/i);
      if (ambientMatch && !info.environment) {
        info.environment = ambientMatch[1].trim();
        continue;
      }
      
      // También buscar ambiente sin prefijo
      if (this.projectInfoPatterns.environment.test(line) && !info.environment) {
        const envMatch = line.match(/(desarrollo|calidad|produccion|producción|drp|development|quality|production)/i);
        if (envMatch) {
          info.environment = envMatch[1];
          continue;
        }
      }
      
      // Fecha
      const dateMatch = line.match(/fecha:\s*(.+)/i) ||
                       line.match(/(\d{1,2}\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4})/i) ||
                       line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch && !info.creation_date) {
        info.creation_date = dateMatch[1].trim();
        continue;
      }
      
      // Versión
      const versionMatch = line.match(/version\s+(.+)/i) ||
                          line.match(/v\s*(\d+\.\d+)/i);
      if (versionMatch && !info.diagram_version) {
        info.diagram_version = versionMatch[1].trim();
        continue;
      }
      
      // ID IEECO (ecosistema)
      const iecoMatch = line.match(/id\s+ieeco\s+(.+)/i) ||
                       line.match(/ieeco\s+(.+)/i);
      if (iecoMatch && !info.ecosistema) {
        info.ecosistema = iecoMatch[1].trim();
        continue;
      }
    }
    
    return info;
  }

  /**
   * Extrae información del proyecto de elementos individuales como fallback
   * @private
   */
  _extractFromAccountAlias(elements) {
    const info = { found: false, data: {} };

    for (const element of elements) {
      const rawText = this._cleanLabel(element.label || element.value || '');
      // Formato: "Alias Account mx-EKT-CONCESIONARIOS-EKTMOTOS-PAPERLESS-DEV..."
      const aliasMatch = rawText.match(/Alias\s+Account\s+(mx(?:-[A-Z0-9]+)+)/i);
      if (aliasMatch) {
        const alias = aliasMatch[1].toUpperCase();
        const parts = alias.split('-').filter(Boolean);
        // [MX, EKT, CONCESIONARIOS, EKTMOTOS, PAPERLESS, DEV]
        if (parts.length >= 5) {
          const env        = parts[parts.length - 1];
          const project    = parts[parts.length - 2];
          const ecosistema = parts[parts.length - 3];
          const area       = parts.slice(2, parts.length - 3).join('-') || parts[2];

          info.data.project_name = project.toLowerCase();
          info.data.ecosistema   = ecosistema.toLowerCase();
          info.data.area         = area.toLowerCase();
          info.data.environment  = this._normalizeEnvironment(env);
          info.found = true;
          break;
        }
      }
    }

    return info;
  }

  _extractProjectInfoFromElements(elements) {
    const info = {
      found: false,
      data: {}
    };
    
    // Buscar elementos con información del proyecto
    for (const element of elements) {
      const text = (element.label || element.value || '').toLowerCase();
      const rawText = this._cleanLabel(element.label || element.value || '');

      // Parsear alias de cuenta AWS: mx-{area}-{ecosistema}-{project_name}-{environment}
      // Ejemplo: Alias Account mx-EKT-CONCESIONARIOS-EKTMOTOS-PAPERLESS-DEV
      const aliasMatch = rawText.match(/Alias\s+Account\s+(mx-[A-Z0-9]+(?:-[A-Z0-9]+)+)/i);
      if (aliasMatch && !info.data.project_name) {
        const alias = aliasMatch[1].toUpperCase();
        // Formato: mx-{prefix}-{area}-{ecosistema}-{project_name}-{environment}
        const parts = alias.split('-').filter(Boolean);
        // partes: [MX, EKT, CONCESIONARIOS, EKTMOTOS, PAPERLESS, DEV]
        if (parts.length >= 5) {
          const env        = parts[parts.length - 1];
          const project    = parts[parts.length - 2];
          const ecosistema = parts[parts.length - 3];
          const area       = parts.slice(2, parts.length - 3).join('-') || parts[2];

          info.data.project_name = project.toLowerCase();
          info.data.ecosistema   = ecosistema.toLowerCase();
          info.data.area         = area.toLowerCase();
          info.data.environment  = this._normalizeEnvironment(env);
          info.found = true;
          continue;
        }
      }
      
      // Buscar nombre del proyecto
      if (text.includes('proyecto') && !info.data.project_name) {
        const projectMatch = text.match(/proyecto\s*:?\s*([^\n\r]+)/i);
        if (projectMatch) {
          info.data.project_name = projectMatch[1].trim();
          info.found = true;
        }
      }
      
      // Buscar ambiente
      if (this.projectInfoPatterns.environment.test(text) && !info.data.environment) {
        const envMatch = text.match(/(desarrollo|calidad|produccion|drp|development|quality|production)/i);
        if (envMatch) {
          info.data.environment = envMatch[1];
          info.found = true;
        }
      }
      
      // Buscar IEECO
      if (text.includes('ieeco') && !info.data.ecosistema) {
        const iecoMatch = text.match(/ieeco\s*:?\s*([^\s\n\r]+)/i);
        if (iecoMatch) {
          info.data.ecosistema = iecoMatch[1];
          info.found = true;
        }
      }
    }
    
    return info;
  }

  /**
   * Limpia el nombre del proyecto
   * @private
   */
  _cleanProjectName(name) {
    if (!name || typeof name !== 'string') {
      return 'aws-project';
    }
    
    return name.trim()
      .replace(/proyecto\s*:?\s*/i, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .substring(0, 50) || 'aws-project';
  }

  /**
   * Normaliza el ambiente
   * @private
   */
  _normalizeEnvironment(environment) {
    if (!environment || typeof environment !== 'string') {
      return 'dev';
    }
    
    const env = environment.toLowerCase().trim();
    
    // Mapeo de ambientes
    const envMap = {
      'desarrollo': 'dev',
      'development': 'dev',
      'dev': 'dev',
      'calidad': 'qa',
      'quality': 'qa',
      'qa': 'qa',
      'test': 'qa',
      'produccion': 'prod',
      'producción': 'prod',
      'production': 'prod',
      'prod': 'prod',
      'drp': 'drp',
      'disaster': 'drp'
    };
    
    return envMap[env] || 'dev';
  }

  /**
   * Mapea ambiente a área
   * @private
   */
  _mapEnvironmentToArea(environment) {
    const areaMap = {
      'dev': 'development',
      'qa': 'quality',
      'prod': 'production',
      'drp': 'disaster-recovery'
    };
    
    return areaMap[environment] || 'development';
  }

  /**
   * Limpia el ecosistema
   * @private
   */
  _cleanEcosistema(ecosistema) {
    if (!ecosistema || typeof ecosistema !== 'string') {
      return 'cloud';
    }
    
    return ecosistema.trim()
      .replace(/ieeco\s*:?\s*/i, '')
      .replace(/id\s*/i, '')
      .toLowerCase()
      .substring(0, 20) || 'cloud';
  }

  /**
   * Clasifica un elemento individual para determinar su tipo
   * @private
   */
  _classifyElement(element) {
    const style = (element.style || '').toLowerCase();
    const label = (element.label || element.value || '').toLowerCase();
    const props = element.props || {};

    // Verificar si es vertex (no edge)
    if (!element.vertex && element.vertex !== undefined) {
      return 'unknown';
    }

    // Verificar VPC
    for (const pattern of this.awsPatterns.vpc) {
      if (pattern.test(style) || pattern.test(label) || pattern.test(props.type || '')) {
        return 'vpc';
      }
    }

    // Verificar Subnet
    for (const pattern of this.awsPatterns.subnet) {
      if (pattern.test(style) || pattern.test(label) || pattern.test(props.type || '')) {
        return 'subnet';
      }
    }

    // Verificar Servicios AWS
    for (const pattern of this.awsPatterns.service) {
      if (pattern.test(style) || pattern.test(label)) {
        return 'service';
      }
    }

    return 'unknown';
  }

  /**
   * Extrae el nombre del elemento
   * @private
   */
  _extractName(element) {
    // Prioridad: props.name > label > value > id
    if (element.props && element.props.name) {
      return element.props.name;
    }
    
    if (element.label) {
      return this._cleanLabel(element.label);
    }
    
    if (element.value) {
      return this._cleanLabel(element.value);
    }
    
    return element.id || null;
  }

  /**
   * Extrae CIDR del elemento
   * @private
   */
  _extractCIDR(element) {
    // Buscar en propiedades primero
    if (element.props && element.props.cidr) {
      return element.props.cidr;
    }

    // Buscar en label/value
    const text = (element.label || element.value || '');
    const match = text.match(this.cidrPattern);
    if (match) {
      // Limpiar espacios del CIDR extraído
      return match[0].replace(/\s+/g, '');
    }
    
    return null;
  }

  /**
   * Extrae región del elemento
   * @private
   */
  _extractRegion(element) {
    // Buscar en propiedades primero
    if (element.props && element.props.region) {
      return element.props.region;
    }

    // Buscar en label/value
    const text = (element.label || element.value || '');
    const match = text.match(this.regionPattern);
    return match ? match[0].toLowerCase() : null;
  }

  /**
   * Extrae zona de disponibilidad
   * @private
   */
  _extractAvailabilityZone(element) {
    // Buscar en propiedades
    if (element.props) {
      if (element.props.az || element.props.availabilityZone) {
        return element.props.az || element.props.availabilityZone;
      }
    }

    // Buscar patrones en el texto
    const text = (element.label || element.value || '').toLowerCase();
    
    // Patrones como "us-east-1a", "zone a", "az-1a"
    const azPatterns = [
      /(?:us|eu|ap|sa|ca|af|me)-(?:gov-)?(?:north|south|east|west|central|northeast|southeast|southwest|northwest|central)-\d[a-z]/i,
      /zone\s*([a-z])/i,
      /az[-\s]*([a-z])/i
    ];

    for (const pattern of azPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }

    // Default según requerimientos: us-east-1a o us-east-1b
    return 'us-east-1a';
  }

  /**
   * Clasifica el tipo de subnet (ruteable vs no ruteable)
   * @private
   */
  _classifySubnetType(element) {
    const text = (element.label || element.value || '').toLowerCase();
    const props = element.props || {};

    // Verificar propiedades explícitas
    if (props.type) {
      const type = props.type.toLowerCase();
      if (type.includes('private') && type.includes('non-routable')) {
        return 'private-non-routable';
      }
      if (type.includes('private')) {
        return 'private-routable';
      }
      if (type.includes('public')) {
        return 'public-routable';
      }
    }

    // Inferir del texto
    if (text.includes('private') && (text.includes('non-routable') || text.includes('isolated'))) {
      return 'private-non-routable';
    }
    if (text.includes('private')) {
      return 'private-routable';
    }
    if (text.includes('public')) {
      return 'public-routable';
    }

    // Default: private routable
    return 'private-routable';
  }

  /**
   * Extrae todas las propiedades del elemento
   * @private
   */
  _extractProperties(element) {
    const properties = {};

    // Copiar propiedades existentes
    if (element.props) {
      Object.assign(properties, element.props);
    }

    // Agregar propiedades derivadas
    properties.style = element.style || '';
    properties.originalLabel = element.label || element.value || '';
    
    return properties;
  }

  /**
   * Encuentra el ID del VPC padre de un elemento
   * @private
   */
  _findParentVpcId(element) {
    // Si tiene parent explícito, devolverlo
    if (element.parent) {
      return element.parent;
    }

    // Si tiene propiedades de VPC padre
    if (element.props && element.props.vpcId) {
      return element.props.vpcId;
    }

    return null;
  }

  /**
   * Limpia etiquetas HTML y caracteres especiales
   * @private
   */
  _cleanLabel(label) {
    if (!label) return '';
    
    // Remover tags HTML
    let cleaned = label.replace(/<[^>]+>/g, '');
    
    // Reemplazar entidades HTML comunes
    cleaned = cleaned.replace(/&nbsp;/g, ' ');
    cleaned = cleaned.replace(/&amp;/g, '&');
    cleaned = cleaned.replace(/&lt;/g, '<');
    cleaned = cleaned.replace(/&gt;/g, '>');
    
    // Normalizar espacios
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  /**
   * Genera un ID único para elementos sin ID
   * @private
   */
  _generateId(prefix) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Valida formato CIDR
   * @private
   */
  _validateCIDR(cidr) {
    if (!cidr) return false;
    
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    if (!cidrRegex.test(cidr)) return false;
    
    const [ip, mask] = cidr.split('/');
    const maskNum = parseInt(mask, 10);
    
    // Validar máscara
    if (maskNum < 0 || maskNum > 32) return false;
    
    // Validar octetos IP
    const octets = ip.split('.').map(octet => parseInt(octet, 10));
    return octets.every(octet => octet >= 0 && octet <= 255);
  }

  /**
   * Determina la fuente del CIDR (props, label, etc.)
   * @private
   */
  _getCIDRSource(element) {
    if (element.props && element.props.cidr) {
      return 'properties';
    }
    
    const text = (element.label || element.value || '');
    if (text.match(this.cidrPattern)) {
      return 'label';
    }
    
    return 'none';
  }

  /**
   * Extrae región de una zona de disponibilidad
   * @private
   */
  _extractRegionFromAZ(az) {
    if (!az) return null;
    
    // Patrón: us-east-1a -> us-east-1
    const match = az.match(/^([a-z]{2}-[a-z]+-\d+)[a-z]$/);
    return match ? match[1] : null;
  }

  /**
   * Genera un nombre para mostrar basado en prioridades
   * @private
   */
  _generateDisplayName(element) {
    const name = this._extractName(element);
    if (name && name !== element.id) {
      return name;
    }
    
    // Generar nombre basado en tipo y propiedades
    const type = this._classifyElement(element);
    const cidr = this._extractCIDR(element);
    
    if (type === 'vpc' && cidr) {
      return `VPC-${cidr}`;
    }
    
    if (type === 'subnet' && cidr) {
      const az = this._extractAvailabilityZone(element);
      return `Subnet-${cidr}-${az}`;
    }
    
    return `${type}-${element.id || 'unknown'}`;
  }

  /**
   * Extrae propiedades relacionadas con nombres
   * @private
   */
  _extractNameProperties(element) {
    const props = element.props || {};
    const nameProps = {};
    
    // Propiedades comunes de nombres
    const nameFields = ['name', 'label', 'title', 'displayName', 'alias', 'tag'];
    
    for (const field of nameFields) {
      if (props[field]) {
        nameProps[field] = props[field];
      }
    }
    
    // Extraer tags de AWS si existen
    if (props.tags) {
      nameProps.tags = props.tags;
    }
    
    // Extraer Name tag específicamente
    if (props['tag:Name'] || props.Name) {
      nameProps.nameTag = props['tag:Name'] || props.Name;
    }
    
    return nameProps;
  }

  /**
   * Analiza propiedades adicionales del subnet para clasificación
   * @private
   */
  _analyzeSubnetProperties(subnet, classification) {
    const text = (subnet.label || subnet.value || '').toLowerCase();
    const props = subnet.props || {};
    
    // Buscar indicadores de acceso a internet
    if (text.includes('internet') || text.includes('igw') || text.includes('gateway')) {
      classification.internetAccess = true;
      classification.reasoning.push('Detectado acceso a internet por contenido de etiqueta');
    }
    
    // Buscar indicadores de NAT
    if (text.includes('nat') || props.natGateway) {
      classification.reasoning.push('Detectado NAT Gateway asociado');
    }
    
    // Buscar indicadores de aislamiento
    if (text.includes('isolated') || text.includes('aislad') || text.includes('no-route')) {
      classification.isPrivateNonRoutable = true;
      classification.routingCapability = 'none';
      classification.reasoning.push('Detectado indicador de aislamiento');
    }
  }

  /**
   * Determina si un elemento es una route table
   * @private
   */
  _isRouteTable(element) {
    const style = (element.style || '').toLowerCase();
    const label = (element.label || element.value || '').toLowerCase();
    const props = element.props || {};
    
    return style.includes('route') && style.includes('table') ||
           label.includes('route') && label.includes('table') ||
           label.includes('routing') ||
           (props.type || '').toLowerCase() === 'route-table' ||
           style.includes('mxgraph.aws') && style.includes('route');
  }

  /**
   * Determina si un elemento es un subnet
   * @private
   */
  _isSubnet(element) {
    return this._classifyElement(element) === 'subnet';
  }

  /**
   * Clasifica el tipo de route table
   * @private
   */
  _classifyRouteTableType(element) {
    const text = (element.label || element.value || '').toLowerCase();
    const props = element.props || {};
    
    if (text.includes('main') || props.isMain || props.main) {
      return 'main';
    }
    
    if (text.includes('public') || text.includes('internet')) {
      return 'public';
    }
    
    if (text.includes('private')) {
      return 'private';
    }
    
    return 'custom';
  }

  /**
   * Extrae rutas de un route table
   * @private
   */
  _extractRoutes(element) {
    const props = element.props || {};
    const routes = [];
    
    // Buscar rutas en propiedades
    if (props.routes && Array.isArray(props.routes)) {
      return props.routes;
    }
    
    // Buscar rutas en el texto
    const text = (element.label || element.value || '');
    
    // Buscar patrones de rutas comunes
    const routePatterns = [
      /0\.0\.0\.0\/0\s*->\s*igw/i,  // Internet Gateway
      /0\.0\.0\.0\/0\s*->\s*nat/i,  // NAT Gateway
      /10\.\d+\.\d+\.\d+\/\d+/i,   // VPC CIDR
      /172\.\d+\.\d+\.\d+\/\d+/i,  // Private CIDR
      /192\.168\.\d+\.\d+\/\d+/i   // Private CIDR
    ];
    
    for (const pattern of routePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        routes.push({
          destination: matches[0],
          source: 'label',
          type: 'inferred'
        });
      }
    }
    
    return routes;
  }

  /**
   * Encuentra subnets asociados a un route table
   * @private
   */
  _findAssociatedSubnets(routeTable, allElements) {
    const associatedSubnets = [];
    
    // Buscar por relaciones parent/child
    for (const element of allElements) {
      if (this._isSubnet(element)) {
        // Si el subnet tiene el route table como parent
        if (element.parent === routeTable.id) {
          associatedSubnets.push(element.id);
        }
        
        // Si el subnet tiene referencia explícita al route table
        if (element.props && element.props.routeTableId === routeTable.id) {
          associatedSubnets.push(element.id);
        }
      }
    }
    
    return associatedSubnets;
  }

  /**
   * Determina si es la route table principal
   * @private
   */
  _isMainRouteTable(element) {
    const text = (element.label || element.value || '').toLowerCase();
    const props = element.props || {};
    
    return text.includes('main') || 
           text.includes('principal') ||
           props.isMain === true ||
           props.main === true ||
           (props.type || '').toLowerCase() === 'main';
  }

  /**
   * Encuentra la route table asociada a un subnet
   * @private
   */
  _findRouteTableForSubnet(subnet, allElements) {
    // Buscar por parent relationship
    if (subnet.parent) {
      const parent = allElements.find(el => el.id === subnet.parent);
      if (parent && this._isRouteTable(parent)) {
        return parent.id;
      }
    }
    
    // Buscar por propiedades explícitas
    if (subnet.props && subnet.props.routeTableId) {
      return subnet.props.routeTableId;
    }
    
    // Buscar route table que contenga este subnet
    for (const element of allElements) {
      if (this._isRouteTable(element)) {
        const associatedSubnets = this._findAssociatedSubnets(element, allElements);
        if (associatedSubnets.includes(subnet.id)) {
          return element.id;
        }
      }
    }
    
    return null;
  }

  /**
   * Detecta diagramas sin componentes AWS válidos
   * @param {Array} elements - Array de elementos a analizar
   * @returns {Object} - Resultado de la detección con detalles
   */
  detectDiagramsWithoutAWSComponents(elements) {
    if (!Array.isArray(elements)) {
      throw new AWSExtractionError(
        'INVALID_INPUT',
        'Los elementos deben ser un array'
      );
    }

    const analysis = {
      hasAWSComponents: false,
      totalElements: elements.length,
      validElements: 0,
      awsComponentsFound: {
        vpcs: 0,
        subnets: 0,
        services: 0
      },
      nonAWSElements: 0,
      issues: [],
      recommendations: []
    };

    // Filtrar elementos válidos
    const validElements = elements.filter(el => el && typeof el === 'object');
    analysis.validElements = validElements.length;

    if (validElements.length === 0) {
      analysis.issues.push('No se encontraron elementos válidos en el diagrama');
      analysis.recommendations.push('Verificar que el archivo draw.io contenga elementos gráficos');
      return analysis;
    }

    // Identificar componentes AWS
    try {
      const components = this.identifyAWSComponents(validElements);
      
      analysis.awsComponentsFound.vpcs = components.vpcs.length;
      analysis.awsComponentsFound.subnets = components.subnets.length;
      analysis.awsComponentsFound.services = components.services.length;
      analysis.nonAWSElements = components.unidentified.length;

      const totalAWSComponents = analysis.awsComponentsFound.vpcs + 
                                analysis.awsComponentsFound.subnets + 
                                analysis.awsComponentsFound.services;

      analysis.hasAWSComponents = totalAWSComponents > 0;

      // Generar issues y recomendaciones
      if (!analysis.hasAWSComponents) {
        analysis.issues.push('No se encontraron componentes AWS reconocibles en el diagrama');
        analysis.recommendations.push('Verificar que los elementos usen estilos de la librería AWS de draw.io');
        analysis.recommendations.push('Asegurar que las etiquetas contengan términos como "VPC", "Subnet", "EC2", etc.');
      } else {
        // Verificar arquitectura mínima
        if (analysis.awsComponentsFound.vpcs === 0) {
          analysis.issues.push('No se encontraron VPCs en el diagrama');
          analysis.recommendations.push('Agregar al menos un VPC para una arquitectura AWS válida');
        }
        
        if (analysis.awsComponentsFound.subnets === 0) {
          analysis.issues.push('No se encontraron subnets en el diagrama');
          analysis.recommendations.push('Agregar subnets dentro del VPC para completar la arquitectura');
        }
      }

      // Advertencias sobre elementos no identificados
      if (analysis.nonAWSElements > 0) {
        const percentage = Math.round((analysis.nonAWSElements / analysis.validElements) * 100);
        if (percentage > 50) {
          analysis.issues.push(`${percentage}% de los elementos no fueron identificados como componentes AWS`);
          analysis.recommendations.push('Revisar que los elementos usen la librería de símbolos AWS de draw.io');
        }
      }

    } catch (error) {
      analysis.issues.push(`Error al analizar componentes: ${error.message}`);
      analysis.recommendations.push('Verificar la integridad del archivo draw.io');
    }

    return analysis;
  }

  /**
   * Valida propiedades requeridas de componentes
   * @param {Array} components - Array de componentes a validar
   * @param {Object} requirements - Objeto con requerimientos por tipo de componente
   * @returns {Object} - Resultado de la validación
   */
  validateRequiredProperties(components, requirements = {}) {
    if (!Array.isArray(components)) {
      throw new AWSExtractionError(
        'INVALID_INPUT',
        'Los componentes deben ser un array'
      );
    }

    const defaultRequirements = {
      vpc: ['name', 'cidr'],
      subnet: ['name', 'cidr', 'availabilityZone'],
      service: ['name', 'type']
    };

    const reqs = { ...defaultRequirements, ...requirements };
    
    const validation = {
      isValid: true,
      totalComponents: components.length,
      validComponents: 0,
      invalidComponents: [],
      missingProperties: {},
      summary: {
        vpcs: { total: 0, valid: 0, invalid: 0 },
        subnets: { total: 0, valid: 0, invalid: 0 },
        services: { total: 0, valid: 0, invalid: 0 }
      }
    };

    for (const component of components) {
      if (!component || typeof component !== 'object') {
        continue;
      }

      const componentType = this._determineComponentType(component);
      const requiredProps = reqs[componentType] || [];
      
      // Incrementar contador por tipo
      if (validation.summary[componentType + 's']) {
        validation.summary[componentType + 's'].total++;
      }

      const missingProps = [];
      const componentData = this._extractComponentData(component, componentType);

      // Verificar propiedades requeridas
      for (const prop of requiredProps) {
        if (!componentData[prop] || componentData[prop] === '') {
          missingProps.push(prop);
        }
      }

      if (missingProps.length > 0) {
        validation.isValid = false;
        validation.invalidComponents.push({
          id: component.id || 'unknown',
          type: componentType,
          missingProperties: missingProps,
          element: component
        });

        // Incrementar contador de inválidos
        if (validation.summary[componentType + 's']) {
          validation.summary[componentType + 's'].invalid++;
        }

        // Agregar a resumen de propiedades faltantes
        if (!validation.missingProperties[componentType]) {
          validation.missingProperties[componentType] = {};
        }
        
        for (const prop of missingProps) {
          if (!validation.missingProperties[componentType][prop]) {
            validation.missingProperties[componentType][prop] = 0;
          }
          validation.missingProperties[componentType][prop]++;
        }
      } else {
        validation.validComponents++;
        
        // Incrementar contador de válidos
        if (validation.summary[componentType + 's']) {
          validation.summary[componentType + 's'].valid++;
        }
      }
    }

    return validation;
  }

  /**
   * Reporta componentes incompletos con detalles específicos
   * @param {Array} components - Array de componentes a analizar
   * @returns {Object} - Reporte detallado de componentes incompletos
   */
  reportIncompleteComponents(components) {
    if (!Array.isArray(components)) {
      throw new AWSExtractionError(
        'INVALID_INPUT',
        'Los componentes deben ser un array'
      );
    }

    const report = {
      totalComponents: components.length,
      completeComponents: 0,
      incompleteComponents: [],
      criticalIssues: [],
      warnings: [],
      recommendations: []
    };

    for (const component of components) {
      if (!component || typeof component !== 'object') {
        report.criticalIssues.push({
          type: 'INVALID_COMPONENT',
          message: 'Componente nulo o inválido encontrado',
          component: component
        });
        continue;
      }

      const analysis = this._analyzeComponentCompleteness(component);
      
      if (analysis.isComplete) {
        report.completeComponents++;
      } else {
        report.incompleteComponents.push(analysis);
        
        // Clasificar issues por severidad
        for (const issue of analysis.issues) {
          if (issue.severity === 'critical') {
            report.criticalIssues.push({
              componentId: component.id,
              ...issue
            });
          } else {
            report.warnings.push({
              componentId: component.id,
              ...issue
            });
          }
        }
      }
    }

    // Generar recomendaciones generales
    this._generateCompletionRecommendations(report);

    return report;
  }

  /**
   * Determina el tipo de componente para validación
   * @private
   */
  _determineComponentType(component) {
    const type = this._classifyElement(component);
    return type === 'unknown' ? 'service' : type;
  }

  /**
   * Extrae datos del componente según su tipo
   * @private
   */
  _extractComponentData(component, type) {
    const data = {};
    
    switch (type) {
      case 'vpc':
        data.name = this._extractName(component);
        data.cidr = this._extractCIDR(component);
        data.region = this._extractRegion(component);
        break;
        
      case 'subnet':
        data.name = this._extractName(component);
        data.cidr = this._extractCIDR(component);
        data.availabilityZone = this._extractAvailabilityZone(component);
        data.type = this._classifySubnetType(component);
        break;
        
      case 'service':
        data.name = this._extractName(component);
        data.type = this._guessServiceType(component);
        break;
        
      default:
        data.name = this._extractName(component);
    }
    
    return data;
  }

  /**
   * Adivina el tipo de servicio AWS
   * @private
   */
  _guessServiceType(component) {
    const style = (component.style || '').toLowerCase();
    const label = (component.label || component.value || '').toLowerCase();
    
    // Mapeo de patrones a tipos de servicio
    const servicePatterns = {
      'ec2': ['ec2', 'instance'],
      'rds': ['rds', 'database'],
      's3': ['s3', 'bucket'],
      'lambda': ['lambda', 'function'],
      'alb': ['alb', 'load.*balancer'],
      'nat': ['nat', 'gateway']
    };
    
    for (const [serviceType, patterns] of Object.entries(servicePatterns)) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(style) || regex.test(label)) {
          return serviceType;
        }
      }
    }
    
    return 'unknown';
  }

  /**
   * Analiza la completitud de un componente individual
   * @private
   */
  _analyzeComponentCompleteness(component) {
    const analysis = {
      componentId: component.id || 'unknown',
      type: this._determineComponentType(component),
      isComplete: true,
      completionScore: 0,
      maxScore: 0,
      issues: [],
      missingData: [],
      element: component
    };

    const checks = this._getCompletenessChecks(analysis.type);
    
    for (const check of checks) {
      analysis.maxScore += check.weight;
      
      const result = check.validator(component);
      if (result.isValid) {
        analysis.completionScore += check.weight;
      } else {
        analysis.isComplete = false;
        analysis.issues.push({
          type: check.name,
          severity: check.severity,
          message: result.message,
          suggestion: result.suggestion
        });
        
        if (result.missingData) {
          analysis.missingData.push(result.missingData);
        }
      }
    }

    // Calcular porcentaje de completitud
    analysis.completionPercentage = analysis.maxScore > 0 
      ? Math.round((analysis.completionScore / analysis.maxScore) * 100)
      : 0;

    return analysis;
  }

  /**
   * Obtiene las verificaciones de completitud según el tipo de componente
   * @private
   */
  _getCompletenessChecks(type) {
    const commonChecks = [
      {
        name: 'HAS_ID',
        weight: 10,
        severity: 'critical',
        validator: (comp) => ({
          isValid: !!comp.id,
          message: comp.id ? null : 'Componente sin ID',
          suggestion: 'Asegurar que el elemento tenga un identificador único'
        })
      },
      {
        name: 'HAS_NAME',
        weight: 15,
        severity: 'warning',
        validator: (comp) => {
          const name = this._extractName(comp);
          return {
            isValid: !!name && name.trim() !== '',
            message: name ? null : 'Componente sin nombre',
            suggestion: 'Agregar etiqueta o propiedad name al elemento',
            missingData: name ? null : 'name'
          };
        }
      }
    ];

    const typeSpecificChecks = {
      vpc: [
        {
          name: 'HAS_CIDR',
          weight: 20,
          severity: 'critical',
          validator: (comp) => {
            const cidr = this._extractCIDR(comp);
            const isValid = cidr && this._validateCIDR(cidr);
            return {
              isValid,
              message: isValid ? null : 'VPC sin CIDR válido',
              suggestion: 'Agregar CIDR válido en formato x.x.x.x/xx',
              missingData: isValid ? null : 'cidr'
            };
          }
        },
        {
          name: 'HAS_REGION',
          weight: 10,
          severity: 'warning',
          validator: (comp) => {
            const region = this._extractRegion(comp);
            return {
              isValid: !!region,
              message: region ? null : 'VPC sin región especificada',
              suggestion: 'Especificar región AWS (ej: us-east-1)',
              missingData: region ? null : 'region'
            };
          }
        }
      ],
      
      subnet: [
        {
          name: 'HAS_CIDR',
          weight: 20,
          severity: 'critical',
          validator: (comp) => {
            const cidr = this._extractCIDR(comp);
            const isValid = cidr && this._validateCIDR(cidr);
            return {
              isValid,
              message: isValid ? null : 'Subnet sin CIDR válido',
              suggestion: 'Agregar CIDR válido en formato x.x.x.x/xx',
              missingData: isValid ? null : 'cidr'
            };
          }
        },
        {
          name: 'HAS_AZ',
          weight: 15,
          severity: 'warning',
          validator: (comp) => {
            const az = this._extractAvailabilityZone(comp);
            const isDefault = az === 'us-east-1a' || az === 'us-east-1b';
            return {
              isValid: !!az,
              message: isDefault ? 'Usando zona de disponibilidad por defecto' : null,
              suggestion: isDefault ? 'Especificar zona de disponibilidad explícitamente' : null,
              missingData: az ? null : 'availabilityZone'
            };
          }
        }
      ],
      
      service: [
        {
          name: 'HAS_SERVICE_TYPE',
          weight: 15,
          severity: 'warning',
          validator: (comp) => {
            const serviceType = this._guessServiceType(comp);
            return {
              isValid: serviceType !== 'unknown',
              message: serviceType === 'unknown' ? 'Tipo de servicio no identificado' : null,
              suggestion: 'Usar símbolos de la librería AWS o especificar tipo en etiqueta',
              missingData: serviceType === 'unknown' ? 'serviceType' : null
            };
          }
        }
      ]
    };

    return [...commonChecks, ...(typeSpecificChecks[type] || [])];
  }

  /**
   * Genera recomendaciones generales para completar componentes
   * @private
   */
  _generateCompletionRecommendations(report) {
    const { criticalIssues, warnings, incompleteComponents } = report;
    
    // Recomendaciones basadas en issues críticos
    if (criticalIssues.length > 0) {
      report.recommendations.push('Resolver issues críticos antes de proceder con la generación de Terraform');
      
      const missingCidrCount = criticalIssues.filter(issue => issue.type === 'HAS_CIDR').length;
      if (missingCidrCount > 0) {
        report.recommendations.push(`Agregar CIDR válidos a ${missingCidrCount} componente(s)`);
      }
      
      const missingIdCount = criticalIssues.filter(issue => issue.type === 'HAS_ID').length;
      if (missingIdCount > 0) {
        report.recommendations.push(`Asegurar que ${missingIdCount} componente(s) tengan IDs únicos`);
      }
    }
    
    // Recomendaciones basadas en warnings
    if (warnings.length > 0) {
      const missingNameCount = warnings.filter(w => w.type === 'HAS_NAME').length;
      if (missingNameCount > 0) {
        report.recommendations.push(`Agregar nombres descriptivos a ${missingNameCount} componente(s)`);
      }
      
      const missingServiceTypeCount = warnings.filter(w => w.type === 'HAS_SERVICE_TYPE').length;
      if (missingServiceTypeCount > 0) {
        report.recommendations.push(`Especificar tipos de servicio para ${missingServiceTypeCount} componente(s)`);
      }
    }
    
    // Recomendaciones generales
    if (incompleteComponents.length > 0) {
      const avgCompletion = incompleteComponents.reduce((sum, comp) => sum + comp.completionPercentage, 0) / incompleteComponents.length;
      if (avgCompletion < 50) {
        report.recommendations.push('Considerar revisar el diagrama para incluir más información de configuración');
      }
    }
    
    // Recomendación final
    if (report.completeComponents === 0 && report.totalComponents > 0) {
      report.recommendations.push('Ningún componente está completo. Revisar la documentación de draw.io para AWS');
    }
  }
}