# drawio-aws-parser

Herramienta CLI para leer archivos de diagrama **draw.io** (`.drawio` o `.xml`), extraer los componentes de infraestructura AWS definidos en el diagrama y generar un archivo JSON listo para usarse como variables de Terraform (`.tfvars`).

---

## ¿Qué hace?

1. **Parsea** el archivo draw.io o su XML exportado, incluyendo soporte para contenido comprimido en base64.
2. **Extrae** los componentes AWS identificados en el diagrama:
   - VPCs (nombre, CIDR, región)
   - Subnets (públicas, privadas ruteables, privadas no ruteables, zonas de disponibilidad)
   - Route Tables y sus asociaciones a subnets
   - Servicios AWS (EC2, RDS, ECS, ALB, NAT, etc.)
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
# Procesar diagrama y generar configuración Terraform
drawio-terraform-parser -i architecture.drawio -o terraform-config.json

# Procesar con salida detallada
drawio-terraform-parser -i diagram.xml -o config.json --verbose

# Solo validar el archivo sin generar salida
drawio-terraform-parser -i diagram.drawio --validate

# Con el archivo .drawio
node bin/cli.js -i "diagram.drawio" -o output.json

# Con el archivo .xml
node bin/cli.js -i "diagram.drawio.xml" -o output.json

# Con verbose para ver el detalle del procesamiento
node bin/cli.js -i "diagram.drawio" -o output.json --verbose

# Solo validar sin generar salida
node bin/cli.js -i "diagram.drawio" --validate

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
  "project_name": "mi-proyecto",
  "area": "ekt",
  "ecosistema": "cloud",
  "environment": "dev",
  "region": "us-east-1",
  "vpc_name": "vpc-mi-proyecto-dev",
  "vpc_cidr": "10.0.0.0/16",
  "non_route_cidr": "100.64.0.0/16",
  "has_internet": true,
  "existing_vpc": null,
  "s3_enable_versioning": "Enabled",
  "subnets": {
    "sn-mi-proyecto-private-routable-1a": {
      "cidr": "10.0.1.0/24",
      "az": "us-east-1a",
      "tags": { "Name": "...", "Type": "private_rt", "Environment": "dev" }
    }
  },
  "route_tables": {
    "rt-mi-proyecto-routable-private-1": {
      "routes": [],
      "associated_subnets": ["sn-mi-proyecto-private-routable-1a"],
      "tags": { "Name": "...", "Type": "private_rt", "Environment": "dev" }
    }
  },
  "main_rt": "rt-mi-proyecto-routable-private-1"
}
```

---

## Información del proyecto en el diagrama

La herramienta extrae automáticamente los metadatos del proyecto desde:

1. **Alias de cuenta AWS** — elemento con formato `Alias Account mx-{prefix}-{area}-{ecosistema}-{proyecto}-{ambiente}`
2. **Tabla de información** — tabla en el diagrama con campos como `Proyecto`, `Ambiente`, `Version`, `Fecha`, `ID IEECO`
3. **Valores por defecto** — si no se encuentra ninguna de las anteriores

---

## Arquitectura interna

```
XMLParser          → parsea y descomprime el archivo draw.io
AWSComponentExtractor → identifica y clasifica los componentes AWS
TerraformJSONGenerator → genera y valida la estructura JSON de salida
Pipeline           → orquesta los tres pasos con manejo de errores y recuperación
```

---

## Tests

```bash
npm test
```

Incluye tests unitarios, de integración y tests basados en propiedades (property-based testing con `fast-check`) para validar la correctitud del parser y el generador.

---

## Requisitos

- Node.js >= 18
- draw.io / diagrams.net para crear los diagramas de arquitectura AWS

---

## Licencia

MIT
