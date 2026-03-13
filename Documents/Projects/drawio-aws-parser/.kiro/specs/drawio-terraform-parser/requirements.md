# Documento de Requerimientos

## Introducción

Esta herramienta permite extraer información de diagramas de arquitectura cloud creados en draw.io y generar automáticamente archivos de configuración Terraform (.tfvars) para el despliegue de infraestructura AWS. La herramienta lee archivos XML de draw.io, identifica componentes de AWS (VPC, subnets, servicios), extrae sus propiedades y genera la configuración necesaria para Terraform.

## Glosario

- **DrawIO_Parser**: El sistema principal que procesa archivos de draw.io
- **XML_Reader**: Componente que lee y parsea archivos XML de draw.io
- **AWS_Component_Extractor**: Módulo que identifica y extrae componentes AWS del diagrama
- **Terraform_Generator**: Generador que crea archivos .tfvars basados en los datos extraídos
- **CIDR_Block**: Notación de enrutamiento entre dominios sin clases para definir rangos de IP
- **VPC**: Virtual Private Cloud de AWS
- **Subnet**: Subred dentro de una VPC
- **Route_Table**: Tabla de enrutamiento que controla el tráfico de red

## Requerimientos

### Requerimiento 1

**Historia de Usuario:** Como arquitecto de infraestructura, quiero cargar un archivo de draw.io que contenga mi diagrama de arquitectura AWS, para que el sistema pueda leer y procesar la información del diagrama.

#### Criterios de Aceptación

1. WHEN un usuario proporciona un archivo draw.io (.drawio o .xml), THEN el DrawIO_Parser SHALL leer el contenido XML del archivo
2. WHEN el archivo XML contiene formato válido de draw.io, THEN el XML_Reader SHALL parsear exitosamente la estructura del diagrama
3. WHEN el archivo proporcionado no es un XML válido, THEN el DrawIO_Parser SHALL rechazar el archivo y reportar un error específico
4. WHEN el archivo XML no contiene estructura de draw.io, THEN el DrawIO_Parser SHALL identificar el formato incorrecto y notificar al usuario

### Requerimiento 2

**Historia de Usuario:** Como arquitecto de infraestructura, quiero que el sistema identifique automáticamente los componentes AWS en mi diagrama, para que pueda extraer la información relevante sin intervención manual.

#### Criterios de Aceptación

1. WHEN el diagrama contiene rectángulos que representan VPCs, THEN el AWS_Component_Extractor SHALL identificar estos elementos como componentes VPC
2. WHEN el diagrama contiene elementos que representan subnets, THEN el AWS_Component_Extractor SHALL clasificar estos elementos según su tipo (publcias ruteables, privadas rutables, privadas no rutables)
3. WHEN los componentes AWS tienen propiedades de texto asociadas, THEN el AWS_Component_Extractor SHALL extraer estas propiedades como metadatos del componente
4. WHEN el diagrama contiene servicios AWS adicionales, THEN el AWS_Component_Extractor SHALL identificar y catalogar estos servicios
5. WHEN el diagrama no contenga los datos necesarios, definir como default región = us-east-1, zonas de disponibilidad = us-east-1a. us-east-b. 

### Requerimiento 3

**Historia de Usuario:** Como arquitecto de infraestructura, quiero extraer información específica de cada componente AWS (como CIDR de subnets, nombres, zonas de disponibilidad), para que esta información pueda ser utilizada en la configuración de Terraform.

#### Criterios de Aceptación

1. WHEN una subnet tiene una propiedad de texto con valor CIDR, THEN el AWS_Component_Extractor SHALL extraer el valor CIDR y asociarlo con la subnet
2. WHEN un componente VPC tiene propiedades de configuración, THEN el AWS_Component_Extractor SHALL extraer el nombre, región y CIDR de la VPC
3. WHEN las subnets tienen información de zona de disponibilidad, THEN el AWS_Component_Extractor SHALL extraer y mapear las zonas correctamente
4. WHEN los componentes tienen nombres o etiquetas, THEN el AWS_Component_Extractor SHALL preservar esta información de identificación

### Requerimiento 4

**Historia de Usuario:** Como arquitecto de infraestructura, quiero generar un archivo JSON con estructura específica que contenga toda la información extraída, para que pueda ser transformado posteriormente a formato .tfvars.

#### Criterios de Aceptación

1. WHEN la extracción de componentes está completa, THEN el Terraform_Generator SHALL crear un archivo JSON con la estructura requerida
2. WHEN se generan las subnets en el JSON, THEN el Terraform_Generator SHALL organizarlas en categorías (rutables y no rutables)
3. WHEN se crean las tablas de enrutamiento, THEN el Terraform_Generator SHALL mapear correctamente las subnets a sus tablas correspondientes
4. WHEN se completa la generación, THEN el Terraform_Generator SHALL incluir todos los campos requeridos: project_name, vpc_name, area, ecosistema, environment, region, vpc_cidr, non_route_cidr, has_internet, existing_vpc, s3_enable_versioning, subnets, route_tables, main_rt
5. WHEN la extracción de componentes corresponde a servicios de AWS completar el archivo json con el fragmentos del recusro en terraform 

### Requerimiento 5

**Historia de Usuario:** Como arquitecto de infraestructura, quiero que el sistema maneje errores de parsing y proporcione mensajes claros, para que pueda corregir problemas en mis diagramas o archivos de entrada.

#### Criterios de Aceptación

1. WHEN el parsing del XML falla, THEN el DrawIO_Parser SHALL proporcionar un mensaje de error específico indicando la línea y tipo de problema
2. WHEN no se encuentran componentes AWS válidos, THEN el AWS_Component_Extractor SHALL notificar que el diagrama no contiene arquitectura AWS reconocible
3. WHEN faltan propiedades requeridas en los componentes, THEN el AWS_Component_Extractor SHALL listar las propiedades faltantes y los componentes afectados
4. WHEN la generación del JSON falla, THEN el Terraform_Generator SHALL reportar el error y mantener el estado anterior sin corrupción

### Requerimiento 6

**Historia de Usuario:** Como desarrollador del sistema, quiero que el parsing y la serialización de datos mantengan integridad, para que la información extraída sea confiable y consistente.

#### Criterios de Aceptación

1. WHEN se parsea un archivo XML válido, THEN el XML_Reader SHALL validar la estructura contra el esquema de draw.io
2. WHEN se serializa la información extraída a JSON, THEN el Terraform_Generator SHALL codificar los datos usando formato JSON válido
3. WHEN se procesan los datos extraídos, THEN el sistema SHALL preservar la integridad de todos los valores CIDR, nombres y configuraciones
4. WHEN se completa el procesamiento, THEN el sistema SHALL generar un pretty printer para validar la estructura JSON de salida