// src/XMLParser.js
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { XMLParser as FastXMLParser } from "fast-xml-parser";

/**
 * Error personalizado para errores de parsing de draw.io
 */
export class DrawIOParserError extends Error {
  constructor(type, message, context = {}) {
    super(message);
    this.name = 'DrawIOParserError';
    this.type = type;
    this.context = context;
  }
}

/**
 * Clase XMLParser para procesar archivos draw.io
 * Implementa los métodos requeridos según el diseño del sistema
 */
export class XMLParser {
  constructor() {
    this.parser = new FastXMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      allowBooleanAttributes: true,
      preserveOrder: false,
      trimValues: false,
      ignoreDeclaration: true,  // Ignore XML declaration
      ignorePiTags: true,       // Ignore processing instructions
      parseTagValue: false,     // Don't parse tag values as numbers/booleans
      parseAttributeValue: false // Don't parse attribute values as numbers/booleans
    });
  }

  /**
   * Parsea un archivo draw.io y devuelve el modelo de grafo
   * @param {string} filePath - Ruta al archivo draw.io
   * @returns {Promise<Object>} - Objeto mxGraphModel parseado
   */
  async parseDrawIOFile(filePath) {
    try {
      const xmlContent = await readFile(filePath, "utf8");
      const xmlDoc = this._parseXMLContent(xmlContent);
      return this.extractGraphElements(xmlDoc);
    } catch (error) {
      if (error instanceof DrawIOParserError) {
        throw error;
      }
      if (error.code === 'ENOENT') {
        throw new DrawIOParserError(
          'FILE_NOT_FOUND',
          `Archivo no encontrado: ${filePath}`,
          { filePath }
        );
      }
      throw new DrawIOParserError(
        'FILE_READ_ERROR',
        `Error al leer el archivo: ${error.message}`,
        { filePath, originalError: error }
      );
    }
  }

  /**
   * Valida que el XML tenga formato válido de draw.io
   * @param {Object} xmlDoc - Documento XML parseado
   * @returns {boolean} - true si es válido, lanza error si no
   */
  validateDrawIOFormat(xmlDoc) {
    if (!xmlDoc || typeof xmlDoc !== 'object') {
      throw new DrawIOParserError(
        'INVALID_XML_STRUCTURE',
        'El documento XML no tiene una estructura válida'
      );
    }

    const rootTag = Object.keys(xmlDoc)[0];
    
    // Formatos válidos de draw.io
    const validRootTags = ['mxGraphModel', 'mxfile', 'diagram'];
    
    if (!validRootTags.includes(rootTag)) {
      throw new DrawIOParserError(
        'INVALID_DRAWIO_FORMAT',
        `Formato de draw.io no válido. Se esperaba uno de: ${validRootTags.join(', ')}, pero se encontró: ${rootTag}`,
        { foundRootTag: rootTag, expectedTags: validRootTags }
      );
    }

    // Validaciones específicas por tipo
    if (rootTag === 'mxGraphModel') {
      if (!xmlDoc.mxGraphModel.root) {
        throw new DrawIOParserError(
          'MISSING_ROOT_ELEMENT',
          'El mxGraphModel no contiene elemento root requerido'
        );
      }
    } else if (rootTag === 'mxfile') {
      const mxfile = xmlDoc.mxfile;
      if (!mxfile.diagram) {
        throw new DrawIOParserError(
          'MISSING_DIAGRAM_ELEMENT',
          'El mxfile no contiene elemento diagram requerido'
        );
      }
    }

    return true;
  }

  /**
   * Extrae elementos gráficos del documento XML
   * @param {Object} xmlDoc - Documento XML parseado
   * @returns {Object} - Objeto mxGraphModel con elementos extraídos
   */
  extractGraphElements(xmlDoc) {
    this.validateDrawIOFormat(xmlDoc);

    const rootTag = Object.keys(xmlDoc)[0];

    try {
      let mxGraphModel;
      
      if (rootTag === "mxGraphModel") {
        mxGraphModel = xmlDoc[rootTag];
      } else if (rootTag === "mxfile") {
        mxGraphModel = this._extractFromMxFile(xmlDoc.mxfile);
      } else if (rootTag === "diagram") {
        mxGraphModel = this._extractFromDiagram(xmlDoc.diagram);
      } else {
        throw new DrawIOParserError(
          'UNSUPPORTED_FORMAT',
          `Formato no soportado: ${rootTag}`
        );
      }

      // Filtrar elementos con locked=1 antes de procesar
      this._filterLockedElements(mxGraphModel);

      // Limpiar valores HTML/XML en todos los elementos
      this._cleanValueAttributes(mxGraphModel);
      
      return mxGraphModel;
    } catch (error) {
      if (error instanceof DrawIOParserError) {
        throw error;
      }
      throw new DrawIOParserError(
        'EXTRACTION_ERROR',
        `Error al extraer elementos gráficos: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Parsea contenido XML y maneja errores de formato
   * @private
   */
  _parseXMLContent(xmlContent) {
    if (!xmlContent || typeof xmlContent !== 'string') {
      throw new DrawIOParserError(
        'EMPTY_CONTENT',
        'El contenido del archivo está vacío o no es válido'
      );
    }

    // Validar que el contenido parece ser XML
    const trimmedContent = xmlContent.trim();
    if (!trimmedContent.startsWith('<') || !trimmedContent.endsWith('>')) {
      throw new DrawIOParserError(
        'INVALID_XML_FORMAT',
        'El contenido no tiene formato XML válido (debe comenzar con < y terminar con >)',
        { contentPreview: trimmedContent.substring(0, 100) }
      );
    }

    try {
      const parsed = this.parser.parse(xmlContent);
      return parsed;
    } catch (error) {
      // Proporcionar información específica sobre el error de parsing
      let errorMessage = `Error al parsear XML: ${error.message}`;
      let errorContext = { originalError: error };

      // Intentar identificar el tipo específico de error XML
      if (error.message.includes('Unexpected end of XML input')) {
        errorMessage = 'XML incompleto: el archivo parece estar truncado o incompleto';
        errorContext.errorType = 'INCOMPLETE_XML';
      } else if (error.message.includes('Invalid character')) {
        errorMessage = 'XML contiene caracteres inválidos';
        errorContext.errorType = 'INVALID_CHARACTERS';
      } else if (error.message.includes('Unclosed tag')) {
        errorMessage = 'XML malformado: etiquetas no cerradas correctamente';
        errorContext.errorType = 'UNCLOSED_TAGS';
      } else if (error.message.includes('Expected')) {
        errorMessage = 'XML malformado: estructura sintáctica incorrecta';
        errorContext.errorType = 'SYNTAX_ERROR';
      }

      throw new DrawIOParserError(
        'XML_PARSE_ERROR',
        errorMessage,
        errorContext
      );
    }
  }

  /**
   * Extrae mxGraphModel de un elemento mxfile
   * @private
   */
  _extractFromMxFile(mxfile) {
    const diagrams = Array.isArray(mxfile.diagram) 
      ? mxfile.diagram 
      : [mxfile.diagram];

    const diagram = diagrams[0];
    if (!diagram) {
      throw new DrawIOParserError(
        'NO_DIAGRAM_FOUND',
        'No se encontró elemento diagram en el mxfile'
      );
    }

    if (diagram.mxGraphModel) {
      return diagram.mxGraphModel;
    }

    // Contenido puede estar comprimido
    const text = (diagram["#text"] || diagram.text || "").trim();
    if (!text) {
      throw new DrawIOParserError(
        'EMPTY_DIAGRAM_CONTENT',
        'El elemento diagram no contiene contenido utilizable'
      );
    }

    return this._parseCompressedContent(text);
  }

  /**
   * Extrae mxGraphModel de un elemento diagram
   * @private
   */
  _extractFromDiagram(diagram) {
    if (diagram.mxGraphModel) {
      return diagram.mxGraphModel;
    }

    const text = (diagram["#text"] || diagram.text || "").trim();
    if (!text) {
      throw new DrawIOParserError(
        'EMPTY_DIAGRAM_CONTENT',
        'El elemento diagram no contiene contenido'
      );
    }

    return this._parseCompressedContent(text);
  }

  /**
   * Parsea contenido que puede estar comprimido (base64 + deflate)
   * @private
   */
  _parseCompressedContent(text) {
    // Intentar parseo directo primero
    try {
      const parsed = this.parser.parse(text);
      if (parsed.mxGraphModel) {
        return parsed.mxGraphModel;
      }
    } catch {
      // Continuar con descompresión
    }

    // Intentar descompresión base64 + deflate
    try {
      const raw = Buffer.from(text, "base64");
      const inflated = inflateRawSync(raw);
      const inflatedText = inflated.toString("utf8");
      
      const parsed = this.parser.parse(inflatedText);
      if (!parsed.mxGraphModel) {
        throw new DrawIOParserError(
          'NO_MXGRAPHMODEL_FOUND',
          'El contenido descomprimido no contiene mxGraphModel'
        );
      }
      
      return parsed.mxGraphModel;
    } catch (error) {
      // Proporcionar información específica sobre el tipo de falla
      let errorMessage = 'No fue posible parsear ni descomprimir el contenido del diagrama';
      let errorType = 'DECOMPRESSION_ERROR';
      
      if (error.message.includes('Invalid character')) {
        errorMessage = 'El contenido no es base64 válido para descompresión';
        errorType = 'INVALID_BASE64';
      } else if (error.message.includes('incorrect header check')) {
        errorMessage = 'El contenido comprimido tiene un formato incorrecto';
        errorType = 'INVALID_COMPRESSION_FORMAT';
      }
      
      throw new DrawIOParserError(
        errorType,
        errorMessage,
        { 
          originalError: error,
          contentLength: text.length,
          contentPreview: text.substring(0, 50)
        }
      );
    }
  }

  /**
   * Proporciona información detallada sobre un error de parsing
   * @param {DrawIOParserError} error - Error a analizar
   * @returns {Object} - Información detallada del error
   */
  getErrorDetails(error) {
    if (!(error instanceof DrawIOParserError)) {
      return {
        type: 'UNKNOWN_ERROR',
        message: error.message || 'Error desconocido',
        suggestions: ['Verificar que el archivo sea un XML válido de draw.io']
      };
    }

    const suggestions = [];
    
    switch (error.type) {
      case 'FILE_NOT_FOUND':
        suggestions.push('Verificar que la ruta del archivo sea correcta');
        suggestions.push('Verificar que el archivo existe y tiene permisos de lectura');
        break;
        
      case 'INVALID_XML_FORMAT':
        suggestions.push('Verificar que el archivo sea un XML válido');
        suggestions.push('Abrir el archivo en un editor de texto para revisar su contenido');
        break;
        
      case 'INVALID_DRAWIO_FORMAT':
        suggestions.push('Verificar que el archivo fue creado con draw.io/diagrams.net');
        suggestions.push('Intentar exportar nuevamente desde draw.io en formato XML');
        break;
        
      case 'XML_PARSE_ERROR':
        suggestions.push('Verificar que el XML no esté corrupto');
        suggestions.push('Intentar abrir el archivo en draw.io para validar su integridad');
        break;
        
      case 'DECOMPRESSION_ERROR':
        suggestions.push('El archivo puede estar corrupto o en un formato no soportado');
        suggestions.push('Intentar exportar nuevamente desde draw.io');
        break;
        
      default:
        suggestions.push('Contactar soporte técnico con los detalles del error');
    }

    return {
      type: error.type,
      message: error.message,
      context: error.context || {},
      suggestions
    };
  }

  /**
   * Limpia recursivamente los atributos value de elementos HTML/XML
   * @param {Object} obj - Objeto a procesar
   * @private
   */
  _cleanValueAttributes(obj) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Si es un array, procesar cada elemento
    if (Array.isArray(obj)) {
      obj.forEach(item => this._cleanValueAttributes(item));
      return;
    }

    // Procesar propiedades del objeto
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        // Si la propiedad es 'value' y contiene HTML/XML, limpiarla
        if (key === 'value' && typeof value === 'string') {
          obj[key] = this._cleanHTMLValue(value);
        } else if (typeof value === 'object') {
          // Recursión para objetos anidados
          this._cleanValueAttributes(value);
        }
      }
    }
  }

  /**
   * Limpia un valor HTML/XML y extrae solo el texto plano
   * @param {string} htmlValue - Valor con HTML/XML a limpiar
   * @returns {string} - Texto limpio extraído
   * @private
   */
  _cleanHTMLValue(htmlValue) {
    if (!htmlValue || typeof htmlValue !== 'string') {
      return htmlValue;
    }

    // Si no contiene HTML/XML, retornar tal como está
    if (!htmlValue.includes('&lt;') && !htmlValue.includes('<')) {
      return htmlValue;
    }

    try {
      // Decodificar entidades HTML primero
      let decoded = this._decodeHTMLEntities(htmlValue);
      
      // Remover todas las etiquetas HTML/XML
      let cleaned = decoded.replace(/<[^>]*>/g, '');
      
      // Limpiar espacios extra y saltos de línea
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      
      // Si el resultado está vacío, intentar extraer texto de atributos específicos
      if (!cleaned) {
        cleaned = this._extractTextFromAttributes(htmlValue);
      }
      
      return cleaned || htmlValue; // Fallback al valor original si no se pudo limpiar
    } catch (error) {
      // En caso de error, retornar el valor original
      return htmlValue;
    }
  }

  /**
   * Decodifica entidades HTML comunes
   * @param {string} str - String con entidades HTML
   * @returns {string} - String decodificado
   * @private
   */
  _decodeHTMLEntities(str) {
    const entities = {
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™'
    };

    return str.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
      return entities[entity] || entity;
    });
  }

  /**
   * Filtra recursivamente los elementos mxCell que tengan locked=1 en su style o atributo directo
   * @param {Object} obj - Objeto mxGraphModel o subárbol a procesar
   * @private
   */
  _filterLockedElements(obj) {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (let i = obj.length - 1; i >= 0; i--) {
        if (this._isLockedElement(obj[i])) {
          obj.splice(i, 1);
        } else {
          this._filterLockedElements(obj[i]);
        }
      }
      return;
    }

    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
          if (this._isLockedElement(value[i])) {
            value.splice(i, 1);
          } else {
            this._filterLockedElements(value[i]);
          }
        }
      } else if (value && typeof value === 'object') {
        if (this._isLockedElement(value)) {
          delete obj[key];
        } else {
          this._filterLockedElements(value);
        }
      }
    }
  }

  /**
   * Determina si un elemento tiene locked=1 en su atributo style o como atributo directo
   * @param {Object} element - Elemento a evaluar
   * @returns {boolean}
   * @private
   */
  _isLockedElement(element) {
    if (!element || typeof element !== 'object') return false;

    // Atributo directo: locked="1" o locked=1
    if (element.locked === '1' || element.locked === 1) return true;

    // Dentro del style: "...locked=1;..."
    const style = element.style;
    if (typeof style === 'string' && /(?:^|;)\s*locked\s*=\s*1\s*(?:;|$)/.test(style)) {
      return true;
    }

    return false;
  }

  /**
   * Extrae texto de atributos específicos cuando el contenido principal está vacío
   * @param {string} htmlValue - Valor HTML original
   * @returns {string} - Texto extraído de atributos
   * @private
   */
  _extractTextFromAttributes(htmlValue) {
    // Patrones para extraer texto de diferentes contextos
    const patterns = [
      // Texto entre etiquetas font
      /<font[^>]*>([^<]+)<\/font>/gi,
      // Texto entre etiquetas span
      /<span[^>]*>([^<]+)<\/span>/gi,
      // Texto entre etiquetas div
      /<div[^>]*>([^<]+)<\/div>/gi,
      // Texto simple entre cualquier etiqueta
      />([^<]+)</g
    ];

    for (const pattern of patterns) {
      const matches = htmlValue.match(pattern);
      if (matches && matches.length > 0) {
        // Tomar la primera coincidencia y limpiarla
        const match = matches[0];
        const textMatch = match.match(/>([^<]+)</);
        if (textMatch && textMatch[1]) {
          return textMatch[1].trim();
        }
      }
    }

    return '';
  }
}