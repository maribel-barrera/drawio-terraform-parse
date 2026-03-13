# Documento de Diseño

## Visión General

El DrawIO Terraform Parser es una herramienta de línea de comandos que automatiza la extracción de información de arquitectura AWS desde diagramas draw.io y genera configuraciones Terraform. La herramienta utiliza un pipeline de procesamiento en tres etapas: parsing XML, extracción de componentes AWS, y generación de configuración JSON.

## Arquitectura

La aplicación sigue una arquitectura de pipeline con separación clara de responsabilidades:

```
[Archivo draw.io] → [XML Parser] → [AWS Extractor] → [JSON Generator] → [Archivo .json]
```

### Componentes Principales

1. **CLI Interface**: Punto de entrada que maneja argumentos y coordina el pipeline
2. **XML Parser**: Procesa archivos draw.io y extrae elementos gráficos
3. **AWS Component Extractor**: Identifica y clasifica componentes AWS
4. **JSON Generator**: Crea la estructura JSON de salida
5. **Validation Layer**: Valida datos en cada etapa del pipeline

## Componentes e Interfaces

### XMLParser
```javascript
class XMLParser {
  parseDrawIOFile(filePath)
  extractGraphElements(xmlDoc)
  validateDrawIOFormat(xmlDoc)
}
```

### AWSComponentExtractor
```javascript
class AWSComponentExtractor {
  identifyAWSComponents(elements)
  extractVPCInfo(vpcElements)
  extractSubnetInfo(subnetElements)
  extractRouteTableInfo(elements)
  classifySubnetType(subnet)
}
```

### TerraformJSONGenerator
```javascript
class TerraformJSONGenerator {
  generateConfiguration(awsComponents)
  createSubnetStructure(subnets)
  createRouteTableStructure(routeTables)
  validateOutputStructure(jsonConfig)
}
```

## Modelos de Datos

### DrawIOElement
```javascript
{
  id: string,
  type: string,
  geometry: { x, y, width, height },
  style: string,
  value: string, // texto del elemento
  attributes: Map<string, string>
}
```

### AWSComponent
```javascript
{
  type: 'vpc' | 'subnet' | 'route_table' | 'service',
  name: string,
  properties: Map<string, any>,
  relationships: Array<string> // IDs de componentes relacionados
}
```

### TerraformConfig
```javascript
{
  project_name: string,
  vpc_name: string,
  area: string,
  ecosistema: string,
  environment: string,
  region: string,
  vpc_cidr: string,
  non_route_cidr: string,
  has_internet: boolean,
  existing_vpc: string | null,
  s3_enable_versioning: string,
  subnets: Map<string, SubnetConfig>,
  route_tables: Map<string, RouteTableConfig>,
  main_rt: string
}
```

## Propiedades de Corrección

*Una propiedad es una característica o comportamiento que debe mantenerse verdadero en todas las ejecuciones válidas de un sistema - esencialmente, una declaración formal sobre lo que el sistema debe hacer. Las propiedades sirven como puente entre especificaciones legibles por humanos y garantías de corrección verificables por máquina.*

### Propiedades de Parsing y Validación

**Propiedad 1: Archivos draw.io válidos son siempre parseables**
*Para cualquier* archivo draw.io con formato XML válido, el sistema debe poder leer y parsear exitosamente el contenido sin errores
**Valida: Requerimientos 1.1, 1.2**

**Propiedad 2: Archivos XML inválidos son siempre rechazados**
*Para cualquier* archivo con XML malformado o formato incorrecto, el sistema debe rechazar el archivo y proporcionar un mensaje de error específico
**Valida: Requerimientos 1.3, 1.4**

**Propiedad 3: Validación de esquema draw.io**
*Para cualquier* archivo XML válido de draw.io, la validación contra el esquema debe ser exitosa
**Valida: Requerimientos 6.1**

### Propiedades de Extracción de Componentes

**Propiedad 4: Identificación consistente de componentes AWS**
*Para cualquier* diagrama que contenga elementos AWS válidos (VPC, subnets, servicios), todos los componentes deben ser identificados y clasificados correctamente según su tipo
**Valida: Requerimientos 2.1, 2.2, 2.4**

**Propiedad 5: Extracción completa de propiedades**
*Para cualquier* componente AWS con propiedades de texto asociadas, todas las propiedades (CIDR, nombres, AZ, etiquetas) deben ser extraídas y preservadas correctamente
**Valida: Requerimientos 2.3, 3.1, 3.2, 3.3, 3.4**

**Propiedad 6: Preservación de integridad de datos**
*Para cualquier* conjunto de datos extraídos durante el procesamiento, todos los valores CIDR, nombres y configuraciones deben mantenerse íntegros sin corrupción
**Valida: Requerimientos 6.3**

### Propiedades de Generación JSON

**Propiedad 7: Estructura JSON completa y válida**
*Para cualquier* configuración de componentes AWS extraídos, el JSON generado debe contener todos los campos requeridos y tener formato JSON válido
**Valida: Requerimientos 4.1, 4.4**

**Propiedad 8: Organización correcta de subnets y routing**
*Para cualquier* conjunto de subnets y tablas de enrutamiento, la organización en categorías y el mapeo de subnets a tablas debe ser correcto y consistente
**Valida: Requerimientos 4.2, 4.3**

**Propiedad 9: Round trip de serialización JSON**
*Para cualquier* configuración Terraform válida, serializar a JSON y luego deserializar debe producir una configuración equivalente
**Valida: Requerimientos 6.2, 6.4**

### Propiedades de Manejo de Errores

**Propiedad 10: Manejo robusto de errores de parsing**
*Para cualquier* error de parsing XML, el sistema debe proporcionar mensajes de error específicos y mantener el estado sin corrupción
**Valida: Requerimientos 5.1, 5.4**

**Propiedad 11: Detección de diagramas sin componentes AWS**
*Para cualquier* diagrama que no contenga componentes AWS válidos, el sistema debe detectar esta condición y notificar apropiadamente
**Valida: Requerimientos 5.2**

**Propiedad 12: Validación de completitud de componentes**
*Para cualquier* componente AWS con propiedades faltantes, el sistema debe identificar y reportar específicamente qué propiedades faltan y en qué componentes
**Valida: Requerimientos 5.3**

## Manejo de Errores

### Estrategia de Errores por Capas

1. **Capa de Entrada**: Validación de archivos y formato
   - Verificación de existencia de archivo
   - Validación de formato XML
   - Verificación de esquema draw.io

2. **Capa de Procesamiento**: Errores de extracción y parsing
   - Componentes AWS no encontrados
   - Propiedades faltantes o inválidas
   - Relaciones inconsistentes entre componentes

3. **Capa de Salida**: Errores de generación
   - Fallas en serialización JSON
   - Estructura de datos incompleta
   - Validación de configuración Terraform

### Tipos de Error Específicos

```javascript
class DrawIOParserError extends Error {
  constructor(type, message, context) {
    super(message);
    this.type = type; // 'XML_INVALID', 'AWS_NOT_FOUND', 'GENERATION_FAILED'
    this.context = context; // información adicional del contexto
  }
}
```

## Estrategia de Testing

### Enfoque Dual de Testing

La estrategia combina pruebas unitarias y pruebas basadas en propiedades para cobertura completa:

**Pruebas Unitarias:**
- Ejemplos específicos de archivos draw.io conocidos
- Casos edge específicos (archivos vacíos, XML malformado)
- Integración entre componentes del pipeline
- Validación de estructura JSON de salida

**Pruebas Basadas en Propiedades:**
- Biblioteca: **fast-check** para JavaScript/Node.js
- Configuración: mínimo 100 iteraciones por propiedad
- Cada prueba de propiedad debe estar etiquetada con: **Feature: drawio-terraform-parser, Property {número}: {texto de la propiedad}**
- Generadores inteligentes para crear XMLs válidos de draw.io con componentes AWS variados
- Validación de invariantes a través de múltiples entradas aleatorias

### Generadores de Datos de Prueba

```javascript
// Generador de elementos draw.io válidos
const drawIOElementGenerator = fc.record({
  id: fc.string(),
  type: fc.constantFrom('vpc', 'subnet', 'service'),
  geometry: fc.record({
    x: fc.integer(0, 1000),
    y: fc.integer(0, 1000),
    width: fc.integer(50, 300),
    height: fc.integer(30, 200)
  }),
  value: fc.string(),
  style: fc.string()
});

// Generador de configuraciones CIDR válidas
const cidrGenerator = fc.string().filter(s => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(s));
```

### Cobertura de Testing

- **Parsing XML**: Round trip de archivos draw.io válidos
- **Extracción AWS**: Identificación correcta de todos los tipos de componentes
- **Generación JSON**: Estructura completa y serialización válida
- **Manejo de Errores**: Respuesta apropiada a todas las condiciones de error
- **Integridad de Datos**: Preservación de información a través del pipeline completo