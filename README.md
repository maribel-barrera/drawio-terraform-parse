# drawio-aws-parser

Herramienta CLI para leer archivos de diagrama **draw.io** (`.drawio` o `.xml`), extraer los componentes de infraestructura AWS definidos en el diagrama y generar un archivo JSON listo para usarse como variables de Terraform (`.tfvars`).

---
ßß
## ¿Qué hace?

1. **Parsea** el archivo draw.io o su XML exportado, incluyendo soporte para contenido comprimido en base64.
2. **Extrae** los componentes AWS identificados en el diagrama:
   - VPCs (nombre, CIDR, región)
   - Subnets clasificadas por tipo: privadas ruteables (`private_rt`), privadas no ruteables (`private_nrt`) y públicas (`public-rt`), con zona de disponibilidad
   - Route Tables agrupadas por pares de subnets del mismo tipo
   - Servicios AWS (EC2, RDS, ECS, ALB, NAT, WAF, etc.) con categoría
   - Información del proyecto desde el alias de cuenta AWS o tabla de metadatos del diagrama
3. **Genera** un JSON estructurado con todas las variables necesarias para aprovisionar la infraestructura con Terraform.

---

## Instalación

```bash
npm install
```

Para usar el CLI de forma global:

```bash
npm link
```

---

## Uso

```bash
drawio-terraform-parser --input <archivo.drawio> --output <config.json> [opciones]
```

### Argumentos

| Argumento         | Alias | Descripción                                      |
|-------------------|-------|--------------------------------------------------|
| `--input`         | `-i`  | Ruta al archivo `.drawio` o `.xml` (requerido)   |
| `--output`        | `-o`  | Ruta del archivo JSON de salida (requerido)      |
| `--verbose`       | `-v`  | Muestra información detallada del procesamiento  |
| `--validate`      |       | Solo valida el archivo sin generar salida        |
| `--help`          | `-h`  | Muestra la ayuda                                 |

### Ejemplos

```bash
# Especificar archivo de salida
node bin/cli.js --input arqui-test.drawio --output terraform.tfvars

# Con el archivo .drawio JSON intermedio)
node bin/cli.js -i "diagram.drawio" -o output.json

# Con el archivo .xml (JSON intermedio)
node bin/cli.js -i "diagram.drawio.xml" -o output.json

# Con verbose para ver el detalle del procesamiento
node bin/cli.js -i "diagram.drawio" -o output.json --verbose

# Solo validar sin generar salida
node bin/cli.js -i "diagram.drawio" --validate

# Con template de variables personalizado
node bin/cli.js --input arqui-test.drawio --vars-template ./variables.tf

# Ver ayuda
node bin/cli.js --help

```

---

## Formatos de entrada soportados

- Archivos `.drawio` (formato nativo de draw.io / diagrams.net)
- Archivos `.xml` exportados desde draw.io
- Archivos con contenido de diagrama comprimido en base64 (deflate)

---

## Estructura del JSON generado

El archivo de salida contiene las variables listas para un módulo Terraform de red AWS:

```json
{
  "project_name": "paperless",
  "area": "concesionarios",
  "ecosistema": "ektmotos",
  "environment": "dev",
  "region": "us-east-1",
  "has_internet": true,
  "existing_vpc": null,
  "s3_enable_versioning": "Enabled",
  "vpc_name": "vpc-paperless-dev",
  "vpc_cidr": "10.102.67.0/24",
  "non_route_cidr": "100.64.0.0/16",
  "cidr_blocks": ["10.102.67.0/24", "100.64.0.0/16", "..."],
  "availability_zones": ["us-east-1a", "us-east-1b"],
  "subnets": {
    "subnet-privada-rt1-dev": {
      "cidr": "10.102.67.64/27",
      "az": "us-east-1a",
      "tags": { "Name": "subnet-privada-rt1-dev", "Type": "private_rt", "Environment": "dev" }
    }
  },
  "route_tables": {
    "rt-paperless-routable-private-1": {
      "routes": [],
      "associated_subnets": ["subnet-privada-rt1-dev", "subnet-privada-rt2-dev"],
      "tags": { "Name": "rt-paperless-routable-private-1", "Type": "private_rt", "Environment": "dev" }
    }
  },
  "main_rt": "rt-paperless-routable-private-1",
  "services": [
    { "label": "ECS FargateBackEnd", "icon": "Amazon ECS", "category": "compute" }
  ]
}
```

### Tipos de subnet soportados

| Tipo           | Tag `Type`      | Descripción                          |
|----------------|-----------------|--------------------------------------|
| Privada ruteable | `private_rt`  | Subnet con acceso a internet vía NAT |
| Privada no ruteable | `private_nrt` | Subnet aislada sin salida a internet |
| Pública        | `public-rt`     | Subnet con acceso directo a internet |

### Nomenclatura de Route Tables

Las route tables se generan agrupando subnets del mismo tipo en pares:

```
rt-{proyecto}-{routable|non-routable}-{private|public}-{índice}
```

Ejemplos:
- `rt-paperless-routable-private-1`
- `rt-paperless-non-routable-private-1`
- `rt-paperless-routable-public-1`

### Categorías de servicios AWS

Los servicios extraídos del diagrama se clasifican automáticamente en:

| Categoría    | Ejemplos                                      |
|--------------|-----------------------------------------------|
| `compute`    | ECS, EC2, Auto Scaling, ECR                   |
| `network`    | ALB, NAT Gateway, Route 53, Transit Gateway   |
| `security`   | WAF, GuardDuty, Shield, Secrets Manager       |
| `database`   | RDS, DynamoDB                                 |
| `storage`    | S3                                            |
| `monitoring` | CloudWatch, CloudTrail, Config, Inspector     |

---

## Información del proyecto en el diagrama

La herramienta extrae automáticamente los metadatos del proyecto desde:

1. **Alias de cuenta AWS** — elemento con formato `Alias Account mx-{prefix}-{area}-{ecosistema}-{proyecto}-{ambiente}`
2. **Tabla de información** — tabla en el diagrama con campos como `Proyecto`, `Ambiente`, `Version`, `Fecha`, `ID IEECO`
3. **Valores por defecto** — si no se encuentra ninguna de las anteriores

El campo `_info_source` en el JSON de salida indica cuál fuente se utilizó (`account_alias`, `info_table`, o `defaults`).

---

## Arquitectura interna

```
XMLParser              → parsea y descomprime el archivo draw.io
AWSComponentExtractor  → identifica y clasifica los componentes AWS
JSONGenerator          → genera y valida la estructura JSON de salida
Pipeline               → orquesta los tres pasos con manejo de errores y recuperación
```

### Manejo de errores

Cada módulo lanza errores tipados (`DrawIOParserError`, `AWSExtractionError`, `TerraformGenerationError`) con contexto detallado y sugerencias de resolución.

---

## Tests

```bash
npm test
```

Incluye:
- Tests unitarios por módulo
- Tests de integración del pipeline completo
- Tests basados en propiedades (property-based testing con `fast-check`) para `XMLParser`, `AWSComponentExtractor` y `JSONGenerator`

---

## Requisitos

- Node.js >= 18
- draw.io / diagrams.net para crear los diagramas de arquitectura AWS

---

## Licencia

MIT
