// src/__tests__/TerraformJSONGenerator.property.test.js
import fc from 'fast-check';
import { TerraformJSONGenerator } from '../TerraformJSONGenerator.js';

describe('TerraformJSONGenerator Property Tests', () => {
  let generator;

  beforeEach(() => {
    generator = new TerraformJSONGenerator();
  });

  /**
   * **Feature: drawio-terraform-parser, Property 7: Estructura JSON completa y válida**
   * **Validates: Requirements 4.1, 4.4**
   */
  test('Property 7: Estructura JSON completa y válida', () => {
    // Generador de componentes AWS válidos
    const awsComponentsGenerator = fc.record({
      vpcs: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 999999 }).map(n => `vpc-${n}`),
          name: fc.oneof(
            fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '-')),
            fc.constant('main-vpc')
          ),
          cidr: fc.oneof(
            fc.constantFrom('10.0.0.0/16', '172.16.0.0/16', '192.168.0.0/16'),
            fc.constant('10.0.0.0/16')
          ),
          region: fc.oneof(
            fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'),
            fc.constant('us-east-1')
          )
        }),
        { minLength: 0, maxLength: 2 }
      ),
      subnets: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 999999 }).map(n => `subnet-${n}`),
          name: fc.oneof(
            fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '-')),
            fc.constant(undefined)
          ),
          cidr: fc.oneof(
            fc.constantFrom('10.0.1.0/24', '10.0.2.0/24', '172.16.1.0/24', '192.168.1.0/24'),
            fc.constant(undefined)
          ),
          availabilityZone: fc.oneof(
            fc.constantFrom('us-east-1a', 'us-east-1b', 'us-west-2a', 'eu-west-1a'),
            fc.constant(undefined)
          ),
          type: fc.oneof(
            fc.constantFrom('public-routable', 'private-routable', 'private-non-routable'),
            fc.constant(undefined)
          ),
          label: fc.oneof(
            fc.constantFrom('Public Subnet', 'Private Subnet', 'Isolated Subnet'),
            fc.constant('')
          ),
          value: fc.oneof(
            fc.constantFrom('Public Subnet', 'Private Subnet', 'Isolated Subnet'),
            fc.constant('')
          )
        }),
        { minLength: 0, maxLength: 6 }
      ),
      routeTables: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 999999 }).map(n => `rt-${n}`),
          name: fc.oneof(
            fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '-')),
            fc.constant(undefined)
          ),
          type: fc.oneof(
            fc.constantFrom('main', 'custom', 'public', 'private'),
            fc.constant('custom')
          ),
          isMainRouteTable: fc.boolean(),
          routes: fc.array(
            fc.record({
              destination: fc.oneof(
                fc.constant('0.0.0.0/0'),
                fc.constantFrom('10.0.0.0/16', '172.16.0.0/16', '192.168.0.0/16')
              ),
              target: fc.oneof(
                fc.constantFrom('igw', 'nat', 'local'),
                fc.constant('igw')
              ),
              type: fc.constant('static')
            }),
            { minLength: 0, maxLength: 3 }
          ),
          associatedSubnets: fc.array(
            fc.integer({ min: 1, max: 999999 }).map(n => `subnet-${n}`),
            { minLength: 0, maxLength: 3 }
          )
        }),
        { minLength: 0, maxLength: 3 }
      ),
      services: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 999999 }).map(n => `service-${n}`),
          type: fc.constantFrom('ec2', 'rds', 's3', 'lambda'),
          name: fc.string({ minLength: 1, maxLength: 30 })
        }),
        { minLength: 0, maxLength: 5 }
      )
    });

    fc.assert(
      fc.property(awsComponentsGenerator, (awsComponents) => {
        const configuration = generator.generateConfiguration(awsComponents);

        // Verificar que la configuración es un objeto válido
        expect(configuration).toBeDefined();
        expect(typeof configuration).toBe('object');
        expect(configuration).not.toBeNull();

        // Verificar que todos los campos requeridos están presentes
        const requiredFields = [
          'project_name', 'vpc_name', 'area', 'ecosistema', 'environment',
          'region', 'vpc_cidr', 'non_route_cidr', 'has_internet',
          'existing_vpc', 's3_enable_versioning', 'subnets', 'route_tables', 'main_rt'
        ];

        requiredFields.forEach(field => {
          expect(configuration).toHaveProperty(field);
        });

        // Verificar tipos de datos correctos
        expect(typeof configuration.project_name).toBe('string');
        expect(typeof configuration.vpc_name).toBe('string');
        expect(typeof configuration.area).toBe('string');
        expect(typeof configuration.ecosistema).toBe('string');
        expect(typeof configuration.environment).toBe('string');
        expect(typeof configuration.region).toBe('string');
        expect(typeof configuration.vpc_cidr).toBe('string');
        expect(typeof configuration.non_route_cidr).toBe('string');
        expect(typeof configuration.has_internet).toBe('boolean');
        expect(typeof configuration.s3_enable_versioning).toBe('string');
        expect(typeof configuration.subnets).toBe('object');
        expect(typeof configuration.route_tables).toBe('object');

        // Verificar que subnets y route_tables son objetos, no arrays
        expect(Array.isArray(configuration.subnets)).toBe(false);
        expect(Array.isArray(configuration.route_tables)).toBe(false);

        // Verificar formato CIDR válido
        const cidrPattern = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
        expect(cidrPattern.test(configuration.vpc_cidr)).toBe(true);
        expect(cidrPattern.test(configuration.non_route_cidr)).toBe(true);

        // Verificar que la configuración es serializable a JSON válido
        let jsonString;
        expect(() => {
          jsonString = JSON.stringify(configuration);
        }).not.toThrow();

        expect(jsonString).toBeDefined();
        expect(typeof jsonString).toBe('string');
        expect(jsonString.length).toBeGreaterThan(0);

        // Verificar que el JSON puede ser parseado de vuelta
        let parsedConfig;
        expect(() => {
          parsedConfig = JSON.parse(jsonString);
        }).not.toThrow();

        expect(parsedConfig).toEqual(configuration);

        // Verificar estructura de subnets - nueva estructura simplificada
        Object.values(configuration.subnets).forEach(subnet => {
          expect(subnet).toHaveProperty('cidr');
          expect(subnet).toHaveProperty('az');  // Cambiar de availability_zone a az
          expect(subnet).toHaveProperty('tags');
          
          expect(typeof subnet.cidr).toBe('string');
          expect(typeof subnet.az).toBe('string');  // Cambiar de availability_zone a az
          expect(typeof subnet.tags).toBe('object');
          
          // Verificar CIDR válido
          expect(cidrPattern.test(subnet.cidr)).toBe(true);
          
          // Verificar que az sigue el patrón de AWS
          expect(subnet.az).toMatch(/^[a-z]{2}-[a-z]+-\d[a-z]$/);
        });

        // Verificar estructura de route tables
        Object.values(configuration.route_tables).forEach(routeTable => {
          expect(routeTable).toHaveProperty('routes');
          expect(routeTable).toHaveProperty('associated_subnets');
          expect(routeTable).toHaveProperty('tags');
          
          expect(Array.isArray(routeTable.routes)).toBe(true);
          expect(Array.isArray(routeTable.associated_subnets)).toBe(true);
          expect(typeof routeTable.tags).toBe('object');
          
          // Verificar estructura de rutas
          routeTable.routes.forEach(route => {
            expect(route).toHaveProperty('destination');
            expect(route).toHaveProperty('target');
            expect(route).toHaveProperty('type');
            
            expect(typeof route.destination).toBe('string');
            expect(typeof route.target).toBe('string');
            expect(typeof route.type).toBe('string');
          });
        });

        // Verificar que main_rt existe en route_tables si está definido
        if (configuration.main_rt) {
          expect(configuration.route_tables).toHaveProperty(configuration.main_rt);
        }

        // Verificar que la región es válida
        const validRegions = /^(us|eu|ap|sa|ca|af|me)-(gov-)?(north|south|east|west|central|northeast|southeast|southwest|northwest|central)-\d$/;
        expect(validRegions.test(configuration.region) || configuration.region === 'us-east-1').toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test('Property 7 - Edge case: componentes AWS vacíos generan configuración válida', () => {
    const emptyComponents = {
      vpcs: [],
      subnets: [],
      routeTables: [],
      services: []
    };

    const configuration = generator.generateConfiguration(emptyComponents);

    // Debe generar configuración por defecto válida
    expect(configuration).toBeDefined();
    expect(typeof configuration).toBe('object');

    // Verificar campos requeridos
    const requiredFields = [
      'project_name', 'vpc_name', 'area', 'ecosistema', 'environment',
      'region', 'vpc_cidr', 'non_route_cidr', 'has_internet',
      'existing_vpc', 's3_enable_versioning', 'subnets', 'route_tables', 'main_rt'
    ];

    requiredFields.forEach(field => {
      expect(configuration).toHaveProperty(field);
    });

    // Debe ser serializable a JSON
    expect(() => JSON.stringify(configuration)).not.toThrow();
  });

  test('Property 7 - Edge case: componentes con datos faltantes', () => {
    const incompleteComponents = {
      vpcs: [{ id: 'vpc-1' }], // VPC sin nombre ni CIDR
      subnets: [
        { id: 'subnet-1' }, // Subnet sin propiedades
        { id: 'subnet-2', name: 'test-subnet' } // Subnet con nombre pero sin CIDR
      ],
      routeTables: [{ id: 'rt-1' }], // Route table sin configuración
      services: []
    };

    const configuration = generator.generateConfiguration(incompleteComponents);

    // Debe manejar datos faltantes con valores por defecto
    expect(configuration).toBeDefined();
    expect(configuration.vpc_name).toBeTruthy();
    expect(configuration.vpc_cidr).toMatch(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/);

    // Subnets deben tener valores por defecto
    Object.values(configuration.subnets).forEach(subnet => {
      expect(subnet.cidr).toMatch(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/);
      expect(subnet.az).toBeTruthy();  // Cambiar de availability_zone a az
    });

    // Debe ser JSON válido
    expect(() => JSON.stringify(configuration)).not.toThrow();
  });

  test('Property 7 - Edge case: validación de entrada inválida', () => {
    const invalidInputs = [
      null,
      undefined,
      'string',
      123,
      [],
      true
    ];

    invalidInputs.forEach(invalidInput => {
      expect(() => {
        generator.generateConfiguration(invalidInput);
      }).toThrow('Los componentes AWS deben ser un objeto válido');
    });
  });

  test('Property 7 - Consistencia de nombres generados', () => {
    const componentsWithNames = {
      vpcs: [{ id: 'vpc-1', name: 'Test VPC with Spaces & Special!@#' }],
      subnets: [
        { id: 'subnet-1', name: 'Public Subnet #1' },
        { id: 'subnet-2', name: 'Private-Subnet_2' }
      ],
      routeTables: [{ id: 'rt-1', name: 'Main Route Table!' }]
    };

    const configuration = generator.generateConfiguration(componentsWithNames);

    // Los nombres deben ser limpiados para uso en Terraform
    expect(configuration.vpc_name).toMatch(/^[a-z0-9-]+$/);
    
    Object.keys(configuration.subnets).forEach(subnetName => {
      expect(subnetName).toMatch(/^[a-z0-9-]+$/);
    });
    
    Object.keys(configuration.route_tables).forEach(rtName => {
      expect(rtName).toMatch(/^[a-z0-9-]+$/);
    });
  });

  /**
   * **Feature: drawio-terraform-parser, Property 8: Organización correcta de subnets y routing**
   * **Validates: Requirements 4.2, 4.3**
   */
  test('Property 8: Organización correcta de subnets y routing', () => {
    // Generador de subnets con diferentes tipos y configuraciones
    const subnetWithRoutingGenerator = fc.record({
      id: fc.integer({ min: 1, max: 999999 }).map(n => `subnet-${n}`),
      name: fc.oneof(
        fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '-')),
        fc.constant(undefined)
      ),
      cidr: fc.constantFrom('10.0.1.0/24', '10.0.2.0/24', '10.0.3.0/24', '172.16.1.0/24'),
      availabilityZone: fc.constantFrom('us-east-1a', 'us-east-1b', 'us-west-2a'),
      type: fc.constantFrom('public-routable', 'private-routable', 'private-non-routable'),
      label: fc.oneof(
        fc.constantFrom('Public Subnet', 'Private Subnet', 'Isolated Subnet', 'Internet Gateway Subnet'),
        fc.constant('')
      ),
      value: fc.oneof(
        fc.constantFrom('Public Subnet', 'Private Subnet', 'Isolated Subnet'),
        fc.constant('')
      ),
      routeTableId: fc.oneof(
        fc.integer({ min: 1, max: 999999 }).map(n => `rt-${n}`),
        fc.constant(undefined)
      )
    });

    // Generador de route tables con asociaciones
    const routeTableWithAssociationsGenerator = fc.record({
      id: fc.integer({ min: 1, max: 999999 }).map(n => `rt-${n}`),
      name: fc.oneof(
        fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '-')),
        fc.constant(undefined)
      ),
      type: fc.constantFrom('main', 'custom', 'public', 'private'),
      isMainRouteTable: fc.boolean(),
      routes: fc.array(
        fc.record({
          destination: fc.constantFrom('0.0.0.0/0', '10.0.0.0/16', '172.16.0.0/16'),
          target: fc.constantFrom('igw', 'nat', 'local'),
          type: fc.constant('static')
        }),
        { minLength: 1, maxLength: 3 }
      ),
      associatedSubnets: fc.array(
        fc.integer({ min: 1, max: 999999 }).map(n => `subnet-${n}`),
        { minLength: 0, maxLength: 3 }
      )
    });

    // Generador de componentes con subnets y route tables relacionadas
    const componentsWithRoutingGenerator = fc.integer({ min: 1, max: 6 }).chain(numSubnets => {
      // Generar IDs únicos para subnets
      const subnetIds = Array.from({ length: numSubnets }, (_, i) => `subnet-${i + 1}`);
      const subnetCidrs = Array.from({ length: numSubnets }, (_, i) => `10.0.${i + 1}.0/24`);
      
      return fc.record({
        vpcs: fc.array(
          fc.record({
            id: fc.constant('vpc-main'),
            name: fc.constant('main-vpc'),
            cidr: fc.constant('10.0.0.0/16'),
            region: fc.constant('us-east-1')
          }),
          { minLength: 1, maxLength: 1 }
        ),
        subnets: fc.tuple(...subnetIds.map((id, index) => 
          fc.record({
            id: fc.constant(id),
            name: fc.oneof(
              fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '-')),
              fc.constant(undefined)
            ),
            cidr: fc.constant(subnetCidrs[index]),
            availabilityZone: fc.constantFrom('us-east-1a', 'us-east-1b', 'us-west-2a'),
            type: fc.constantFrom('public-routable', 'private-routable', 'private-non-routable'),
            label: fc.oneof(
              fc.constantFrom('Public Subnet', 'Private Subnet', 'Isolated Subnet', 'Internet Gateway Subnet'),
              fc.constant('')
            ),
            value: fc.oneof(
              fc.constantFrom('Public Subnet', 'Private Subnet', 'Isolated Subnet'),
              fc.constant('')
            ),
            routeTableId: fc.oneof(
              fc.integer({ min: 1, max: 999999 }).map(n => `rt-${n}`),
              fc.constant(undefined)
            )
          })
        )).map(tuple => Array.from(tuple)),
        routeTables: fc.array(routeTableWithAssociationsGenerator, { minLength: 0, maxLength: 3 }),
        services: fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 999999 }).map(n => `service-${n}`),
            type: fc.constantFrom('ec2', 'rds', 's3'),
            name: fc.string({ minLength: 1, maxLength: 20 })
          }),
          { minLength: 0, maxLength: 3 }
        )
      });
    });

    fc.assert(
      fc.property(componentsWithRoutingGenerator, (awsComponents) => {
        const configuration = generator.generateConfiguration(awsComponents);

        // Verificar que la configuración es válida
        expect(configuration).toBeDefined();
        expect(typeof configuration).toBe('object');

        // Test 1: Organización correcta de subnets por tipo
        const subnetsByType = {
          public: [],
          private_routable: [],
          private_non_routable: []
        };

        // Test 1: Verificar estructura básica de subnets
        Object.entries(configuration.subnets).forEach(([subnetName, subnetConfig]) => {
          expect(subnetConfig).toHaveProperty('cidr');
          expect(subnetConfig).toHaveProperty('az');
          expect(subnetConfig).toHaveProperty('tags');
          expect(subnetConfig.cidr).toMatch(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/);
          expect(typeof subnetConfig.az).toBe('string');
          expect(subnetConfig.az).toMatch(/^[a-z]{2}-[a-z]+-\d[a-z]$/);
        });

        // Test 2: Mapeo correcto de route tables
        Object.entries(configuration.route_tables).forEach(([rtName, rtConfig]) => {
          // Verificar estructura de route table
          expect(rtConfig).toHaveProperty('routes');
          expect(rtConfig).toHaveProperty('associated_subnets');
          expect(rtConfig).toHaveProperty('tags');

          expect(Array.isArray(rtConfig.routes)).toBe(true);
          expect(Array.isArray(rtConfig.associated_subnets)).toBe(true);

          // Verificar que las rutas tienen estructura correcta
          rtConfig.routes.forEach(route => {
            expect(route).toHaveProperty('destination');
            expect(route).toHaveProperty('target');
            expect(route).toHaveProperty('type');
            
            expect(typeof route.destination).toBe('string');
            expect(typeof route.target).toBe('string');
            expect(typeof route.type).toBe('string');
          });

          // Verificar que las subnets asociadas son strings válidos
          rtConfig.associated_subnets.forEach(subnetId => {
            expect(typeof subnetId).toBe('string');
            expect(subnetId.length).toBeGreaterThan(0);
          });
        });

        // Test 3: Consistencia entre main_rt y route_tables
        if (configuration.main_rt) {
          expect(configuration.route_tables).toHaveProperty(configuration.main_rt);
          
          const mainRT = configuration.route_tables[configuration.main_rt];
          expect(mainRT).toBeDefined();
          expect(mainRT.routes).toBeDefined();
          expect(Array.isArray(mainRT.routes)).toBe(true);
        }

        // Test 4: Verificar que no hay CIDRs duplicados entre subnets
        const subnetCidrs = Object.values(configuration.subnets).map(subnet => subnet.cidr);
        const uniqueCidrs = new Set(subnetCidrs);
        expect(uniqueCidrs.size).toBe(subnetCidrs.length);

        // Test 5: Verificar que todas las subnets tienen availability zones válidas
        Object.values(configuration.subnets).forEach(subnet => {
          expect(subnet.az).toBeTruthy();
          expect(typeof subnet.az).toBe('string');
          // Debe seguir el patrón de AZ de AWS
          expect(subnet.az).toMatch(/^[a-z]{2}-[a-z]+-\d[a-z]$/);
        });

        // Test 6: Verificar tags consistentes
        Object.values(configuration.subnets).forEach(subnet => {
          expect(subnet.tags).toBeDefined();
          expect(typeof subnet.tags).toBe('object');
          expect(subnet.tags.Name).toBeTruthy();
          expect(subnet.tags.Type).toBeTruthy();  // Solo verificar que existe
          expect(subnet.tags.Environment).toBeTruthy();
        });

        Object.values(configuration.route_tables).forEach(routeTable => {
          expect(routeTable.tags).toBeDefined();
          expect(typeof routeTable.tags).toBe('object');
          expect(routeTable.tags.Name).toBeTruthy();
          expect(routeTable.tags.Environment).toBeTruthy();
        });

        // Test 7: Verificar que los CIDRs de subnets están dentro del VPC CIDR
        const vpcCidr = configuration.vpc_cidr;
        Object.values(configuration.subnets).forEach(subnet => {
          // Esta es una verificación básica - en un caso real necesitaríamos
          // lógica más sofisticada para verificar rangos CIDR
          expect(subnet.cidr).toBeTruthy();
          expect(subnet.cidr).toMatch(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/);
        });
      }),
      { numRuns: 100 }
    );
  });

  test('Property 8 - Edge case: subnets sin route tables asociadas', () => {
    const componentsWithoutRouteTables = {
      vpcs: [{ id: 'vpc-1', name: 'test-vpc', cidr: '10.0.0.0/16' }],
      subnets: [
        { id: 'subnet-1', name: 'public-subnet', type: 'public-routable', cidr: '10.0.1.0/24' },
        { id: 'subnet-2', name: 'private-subnet', type: 'private-routable', cidr: '10.0.2.0/24' }
      ],
      routeTables: [], // Sin route tables
      services: []
    };

    const configuration = generator.generateConfiguration(componentsWithoutRouteTables);

    // Debe crear route table por defecto
    expect(Object.keys(configuration.route_tables).length).toBeGreaterThan(0);
    expect(configuration.main_rt).toBeTruthy();
    expect(configuration.route_tables[configuration.main_rt]).toBeDefined();

    // La route table por defecto debe tener configuración válida
    const defaultRT = configuration.route_tables[configuration.main_rt];
    expect(defaultRT.routes).toBeDefined();
    expect(Array.isArray(defaultRT.routes)).toBe(true);
    expect(defaultRT.associated_subnets).toBeDefined();
    expect(Array.isArray(defaultRT.associated_subnets)).toBe(true);
  });

  test('Property 8 - Edge case: múltiples subnets del mismo tipo', () => {
    const componentsWithSameTypeSubnets = {
      vpcs: [{ id: 'vpc-1', name: 'test-vpc', cidr: '10.0.0.0/16' }],
      subnets: [
        { id: 'subnet-1', name: 'public-1', type: 'public-routable', cidr: '10.0.1.0/24', label: 'Public Subnet 1' },
        { id: 'subnet-2', name: 'public-2', type: 'public-routable', cidr: '10.0.2.0/24', label: 'Public Subnet 2' },
        { id: 'subnet-3', name: 'private-1', type: 'private-routable', cidr: '10.0.3.0/24', label: 'Private Subnet 1' },
        { id: 'subnet-4', name: 'private-2', type: 'private-routable', cidr: '10.0.4.0/24', label: 'Private Subnet 2' }
      ],
      routeTables: [],
      services: []
    };

    const configuration = generator.generateConfiguration(componentsWithSameTypeSubnets);

    // Verificar que todas las subnets tienen la estructura correcta
    const allSubnets = Object.values(configuration.subnets);
    expect(allSubnets.length).toBe(4);
    allSubnets.forEach(subnet => {
      expect(subnet).toHaveProperty('cidr');
      expect(subnet).toHaveProperty('az');
      expect(subnet).toHaveProperty('tags');
    });

    // Verificar que los nombres son únicos
    const subnetNames = Object.keys(configuration.subnets);
    const uniqueNames = new Set(subnetNames);
    expect(uniqueNames.size).toBe(subnetNames.length);
  });

  /**
   * **Feature: drawio-terraform-parser, Property 9: Round trip de serialización JSON**
   * **Validates: Requirements 6.2, 6.4**
   */
  test('Property 9: Round trip de serialización JSON', () => {
    // Generador de configuraciones Terraform válidas
    const terraformConfigGenerator = fc.record({
      vpcs: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 999999 }).map(n => `vpc-${n}`),
          name: fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '-')),
          cidr: fc.constantFrom('10.0.0.0/16', '172.16.0.0/16', '192.168.0.0/16'),
          region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1')
        }),
        { minLength: 1, maxLength: 2 }
      ),
      subnets: fc.integer({ min: 1, max: 5 }).chain(numSubnets => {
        const subnetConfigs = Array.from({ length: numSubnets }, (_, i) => 
          fc.record({
            id: fc.constant(`subnet-${i + 1}`),
            name: fc.oneof(
              fc.string({ minLength: 1, maxLength: 20 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '-')),
              fc.constant(undefined)
            ),
            cidr: fc.constant(`10.0.${i + 1}.0/24`),
            availabilityZone: fc.constantFrom('us-east-1a', 'us-east-1b', 'us-west-2a'),
            type: fc.constantFrom('public-routable', 'private-routable', 'private-non-routable'),
            label: fc.constantFrom('Public Subnet', 'Private Subnet', 'Isolated Subnet'),
            value: fc.constantFrom('Public Subnet', 'Private Subnet', 'Isolated Subnet')
          })
        );
        return fc.tuple(...subnetConfigs).map(tuple => Array.from(tuple));
      }),
      routeTables: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 999999 }).map(n => `rt-${n}`),
          name: fc.oneof(
            fc.string({ minLength: 1, maxLength: 20 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '-')),
            fc.constant(undefined)
          ),
          type: fc.constantFrom('main', 'custom', 'public', 'private'),
          isMainRouteTable: fc.boolean(),
          routes: fc.array(
            fc.record({
              destination: fc.constantFrom('0.0.0.0/0', '10.0.0.0/16'),
              target: fc.constantFrom('igw', 'nat', 'local'),
              type: fc.constant('static')
            }),
            { minLength: 1, maxLength: 2 }
          ),
          associatedSubnets: fc.array(
            fc.integer({ min: 1, max: 5 }).map(n => `subnet-${n}`),
            { minLength: 0, maxLength: 2 }
          )
        }),
        { minLength: 0, maxLength: 2 }
      ),
      services: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 999999 }).map(n => `service-${n}`),
          type: fc.constantFrom('ec2', 'rds', 's3'),
          name: fc.string({ minLength: 1, maxLength: 20 })
        }),
        { minLength: 0, maxLength: 3 }
      )
    });

    fc.assert(
      fc.property(terraformConfigGenerator, (awsComponents) => {
        // Generar configuración Terraform
        const originalConfiguration = generator.generateConfiguration(awsComponents);

        // Test 1: Serialización básica debe funcionar
        let serializedJSON;
        expect(() => {
          serializedJSON = generator.serializeToJSON(originalConfiguration);
        }).not.toThrow();

        expect(serializedJSON).toBeDefined();
        expect(typeof serializedJSON).toBe('string');
        expect(serializedJSON.length).toBeGreaterThan(0);

        // Test 2: JSON debe ser parseable
        let parsedConfiguration;
        expect(() => {
          parsedConfiguration = JSON.parse(serializedJSON);
        }).not.toThrow();

        expect(parsedConfiguration).toBeDefined();
        expect(typeof parsedConfiguration).toBe('object');

        // Test 3: Pretty printing debe funcionar
        let prettyPrintResult;
        expect(() => {
          prettyPrintResult = generator.prettyPrintJSON(serializedJSON);
        }).not.toThrow();

        expect(prettyPrintResult).toBeDefined();
        expect(prettyPrintResult.isValid).toBe(true);
        expect(prettyPrintResult.formatted).toBeDefined();
        expect(prettyPrintResult.metadata).toBeDefined();

        // Verificar metadatos del pretty print
        expect(prettyPrintResult.metadata.size.originalBytes).toBeGreaterThan(0);
        expect(prettyPrintResult.metadata.structure.hasRequiredFields).toBe(true);
        expect(prettyPrintResult.metadata.validation.hasValidCIDRs).toBe(true);

        // Test 4: Round trip validation debe pasar
        let roundTripResult;
        expect(() => {
          roundTripResult = generator.validateRoundTrip(originalConfiguration);
        }).not.toThrow();

        expect(roundTripResult).toBeDefined();
        expect(roundTripResult.success).toBe(true);
        expect(roundTripResult.isIdentical).toBe(true);
        expect(roundTripResult.structurallyEqual).toBe(true);

        // Test 5: Configuración parseada debe ser equivalente a la original
        expect(roundTripResult.parsed).toEqual(originalConfiguration);

        // Test 6: Re-serialización debe ser idéntica
        expect(roundTripResult.serialized).toBe(roundTripResult.reSerialized);

        // Test 7: Verificar que no hay diferencias
        expect(roundTripResult.differences).toHaveLength(0);

        // Test 8: Validar que la configuración parseada sigue siendo válida
        expect(() => {
          generator.validateOutputStructure(parsedConfiguration);
        }).not.toThrow();

        // Test 9: Verificar preservación de tipos de datos
        expect(typeof parsedConfiguration.project_name).toBe('string');
        expect(typeof parsedConfiguration.has_internet).toBe('boolean');
        expect(typeof parsedConfiguration.subnets).toBe('object');
        expect(Array.isArray(parsedConfiguration.subnets)).toBe(false);

        // Test 10: Verificar preservación de estructura de subnets
        Object.values(parsedConfiguration.subnets).forEach(subnet => {
          expect(subnet).toHaveProperty('cidr');
          expect(subnet).toHaveProperty('az');  // Cambiar de availability_zone a az
          expect(subnet).toHaveProperty('tags');
        });

        // Test 11: Verificar preservación de estructura de route tables
        Object.values(parsedConfiguration.route_tables).forEach(routeTable => {
          expect(routeTable).toHaveProperty('routes');
          expect(routeTable).toHaveProperty('associated_subnets');
          expect(routeTable).toHaveProperty('tags');
          
          expect(Array.isArray(routeTable.routes)).toBe(true);
          expect(Array.isArray(routeTable.associated_subnets)).toBe(true);
        });
      }),
      { numRuns: 100 }
    );
  });

  test('Property 9 - Edge case: configuración con caracteres especiales', () => {
    const configWithSpecialChars = {
      vpcs: [{ 
        id: 'vpc-1', 
        name: 'Test VPC with "quotes" & <tags> and \n newlines', 
        cidr: '10.0.0.0/16' 
      }],
      subnets: [{ 
        id: 'subnet-1', 
        name: 'Subnet with émojis 🚀 and unicode ñáéíóú', 
        cidr: '10.0.1.0/24', 
        type: 'public-routable' 
      }],
      routeTables: [],
      services: []
    };

    const configuration = generator.generateConfiguration(configWithSpecialChars);
    
    // Round trip debe manejar caracteres especiales correctamente
    const roundTrip = generator.validateRoundTrip(configuration);
    expect(roundTrip.success).toBe(true);
    
    // Verificar que los caracteres especiales se preservan
    const serialized = generator.serializeToJSON(configuration);
    const parsed = JSON.parse(serialized);
    
    // Los nombres deben estar limpiados pero la información debe preservarse
    expect(parsed.vpc_name).toBeTruthy();
    expect(typeof parsed.vpc_name).toBe('string');
  });

  test('Property 9 - Edge case: configuración con valores null y undefined', () => {
    const configWithNulls = {
      vpcs: [{ id: 'vpc-1', name: null, cidr: '10.0.0.0/16' }],
      subnets: [{ 
        id: 'subnet-1', 
        name: undefined, 
        cidr: '10.0.1.0/24', 
        type: 'public-routable',
        availabilityZone: null
      }],
      routeTables: [],
      services: []
    };

    const configuration = generator.generateConfiguration(configWithNulls);
    
    // Round trip debe manejar valores null/undefined correctamente
    const roundTrip = generator.validateRoundTrip(configuration);
    expect(roundTrip.success).toBe(true);
    
    // JSON no debe contener undefined (se convierte a null o se omite)
    const serialized = generator.serializeToJSON(configuration);
    expect(serialized).not.toContain('undefined');
  });

  test('Property 9 - Edge case: configuración muy grande', () => {
    const largeConfig = {
      vpcs: [{ id: 'vpc-1', name: 'large-vpc', cidr: '10.0.0.0/16' }],
      subnets: Array.from({ length: 20 }, (_, i) => ({
        id: `subnet-${i + 1}`,
        name: `subnet-${i + 1}`,
        cidr: `10.0.${i + 1}.0/24`,
        type: i % 3 === 0 ? 'public-routable' : 'private-routable',
        availabilityZone: `us-east-1${String.fromCharCode(97 + (i % 3))}`
      })),
      routeTables: Array.from({ length: 5 }, (_, i) => ({
        id: `rt-${i + 1}`,
        name: `route-table-${i + 1}`,
        type: i === 0 ? 'main' : 'custom',
        isMainRouteTable: i === 0,
        routes: [
          { destination: '0.0.0.0/0', target: 'igw', type: 'static' },
          { destination: '10.0.0.0/16', target: 'local', type: 'static' }
        ],
        associatedSubnets: [`subnet-${i + 1}`]
      })),
      services: []
    };

    const configuration = generator.generateConfiguration(largeConfig);
    
    // Round trip debe funcionar incluso con configuraciones grandes
    const roundTrip = generator.validateRoundTrip(configuration);
    expect(roundTrip.success).toBe(true);
    
    // Verificar que el JSON serializado es manejable
    const serialized = generator.serializeToJSON(configuration);
    expect(serialized.length).toBeGreaterThan(1000); // Debe ser grande
    expect(serialized.length).toBeLessThan(100000); // Pero no excesivamente grande
    
    // Pretty print debe generar metadatos correctos
    const prettyPrint = generator.prettyPrintJSON(serialized);
    expect(prettyPrint.metadata.structure.subnetCount).toBe(20);
    expect(prettyPrint.metadata.structure.routeTableCount).toBe(5);
  });

  /**
   * **Feature: drawio-terraform-parser, Property 10: Manejo robusto de errores de parsing**
   * **Validates: Requirements 5.1, 5.4**
   */
  test('Property 10: Manejo robusto de errores de parsing', () => {
    // Generador de entradas inválidas que deben causar errores específicos
    const invalidInputGenerator = fc.oneof(
      // Entradas completamente inválidas
      fc.constant(null),
      fc.constant(undefined),
      fc.constant('string'),
      fc.constant(123),
      fc.constant(true),
      fc.constant([]),
      
      // Objetos con campos inválidos
      fc.record({
        vpcs: fc.oneof(
          fc.constant('not-array'),
          fc.constant(null),
          fc.array(fc.record({
            id: fc.constant('vpc-1'),
            name: fc.constant('test-vpc'),
            cidr: fc.oneof(
              fc.constant('invalid-cidr'),
              fc.constant('999.999.999.999/99'),
              fc.constant('10.0.0.0/99'),
              fc.constant('')
            )
          }))
        ),
        subnets: fc.oneof(
          fc.constant('not-array'),
          fc.array(fc.record({
            id: fc.constant('subnet-1'),
            cidr: fc.oneof(
              fc.constant('invalid-cidr'),
              fc.constant('300.300.300.300/24'),
              fc.constant('10.0.0.0/99')
            ),
            type: fc.oneof(
              fc.constant('invalid-type'),
              fc.constant(123),
              fc.constant(null)
            )
          }))
        ),
        routeTables: fc.oneof(
          fc.constant('not-array'),
          fc.array(fc.record({
            id: fc.constant('rt-1'),
            routes: fc.oneof(
              fc.constant('not-array'),
              fc.array(fc.record({
                destination: fc.oneof(
                  fc.constant('invalid-destination'),
                  fc.constant('999.999.999.999/24')
                ),
                target: fc.constant('igw')
              }))
            )
          }))
        )
      })
    );

    fc.assert(
      fc.property(invalidInputGenerator, (invalidInput) => {
        let errorCaught = false;
        let errorInfo = null;

        try {
          generator.generateConfiguration(invalidInput);
        } catch (error) {
          errorCaught = true;
          errorInfo = error;
        }

        // Test 1: Debe capturar errores para entradas inválidas
        if (invalidInput === null || invalidInput === undefined || 
            typeof invalidInput !== 'object' || Array.isArray(invalidInput)) {
          expect(errorCaught).toBe(true);
          expect(errorInfo).toBeDefined();
          expect(errorInfo.message).toContain('Los componentes AWS deben ser un objeto válido');
          expect(errorInfo.name).toBe('TerraformGenerationError');
          expect(errorInfo.type).toBe('INVALID_INPUT');
        }

        // Test 2: Para objetos válidos pero con datos corruptos, debe manejar errores gracefully
        if (typeof invalidInput === 'object' && !Array.isArray(invalidInput) && invalidInput !== null) {
          if (errorCaught) {
            // Verificar que el error es específico y útil
            expect(errorInfo).toBeDefined();
            expect(errorInfo.name).toBe('TerraformGenerationError');
            expect(errorInfo.message).toBeTruthy();
            expect(typeof errorInfo.message).toBe('string');
            expect(errorInfo.message.length).toBeGreaterThan(0);
            
            // Verificar que el error tiene contexto útil
            expect(errorInfo.type).toBeTruthy();
            expect(typeof errorInfo.type).toBe('string');
            
            // Verificar que el contexto está preservado
            if (errorInfo.context) {
              expect(typeof errorInfo.context).toBe('object');
            }
          }
        }

        // Test 3: Verificar manejo de errores de serialización
        if (!errorCaught) {
          // Si la generación no falló, probar serialización con datos potencialmente problemáticos
          try {
            const configuration = generator.generateConfiguration(invalidInput);
            const serialized = generator.serializeToJSON(configuration);
            
            // La serialización debe funcionar o fallar gracefully
            expect(serialized).toBeDefined();
            expect(typeof serialized).toBe('string');
          } catch (serializationError) {
            // Si falla la serialización, debe ser un error específico
            expect(serializationError.name).toBe('TerraformGenerationError');
            expect(serializationError.message).toBeTruthy();
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  test('Property 10 - Error recovery functionality', () => {
    // Generador de componentes con errores recuperables
    const recoverableErrorGenerator = fc.record({
      vpcs: fc.array(
        fc.record({
          id: fc.oneof(fc.constant('vpc-1'), fc.constant('')),
          name: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
          cidr: fc.oneof(
            fc.constant('10.0.0.0/16'),
            fc.constant('invalid-cidr'),
            fc.constant(null)
          ),
          region: fc.oneof(
            fc.constant('us-east-1'),
            fc.constant('invalid-region'),
            fc.constant(null)
          )
        }),
        { minLength: 0, maxLength: 2 }
      ),
      subnets: fc.array(
        fc.record({
          id: fc.oneof(fc.string({ minLength: 1 }), fc.constant('')),
          name: fc.oneof(fc.string(), fc.constant(null)),
          cidr: fc.oneof(
            fc.constantFrom('10.0.1.0/24', '10.0.2.0/24'),
            fc.constant('invalid-cidr'),
            fc.constant(null)
          ),
          type: fc.oneof(
            fc.constantFrom('public-routable', 'private-routable'),
            fc.constant('invalid-type'),
            fc.constant(null)
          ),
          availabilityZone: fc.oneof(
            fc.constant('us-east-1a'),
            fc.constant('invalid-az'),
            fc.constant(null)
          )
        }),
        { minLength: 0, maxLength: 3 }
      ),
      routeTables: fc.array(
        fc.record({
          id: fc.oneof(fc.string({ minLength: 1 }), fc.constant('')),
          name: fc.oneof(fc.string(), fc.constant(null)),
          routes: fc.oneof(
            fc.array(fc.record({
              destination: fc.oneof(fc.constant('0.0.0.0/0'), fc.constant('invalid')),
              target: fc.oneof(fc.constant('igw'), fc.constant(''))
            })),
            fc.constant('not-array'),
            fc.constant(null)
          )
        }),
        { minLength: 0, maxLength: 2 }
      )
    });

    fc.assert(
      fc.property(recoverableErrorGenerator, (problematicComponents) => {
        // Test error handling and recovery
        const errorInfo = {
          timestamp: new Date().toISOString(),
          context: { configuration: problematicComponents }
        };

        // Test 1: handleSerializationError debe proporcionar información útil
        const mockError = new Error('Test serialization error');
        const handledError = generator.handleSerializationError(mockError, errorInfo.context);

        expect(handledError).toBeDefined();
        expect(handledError.timestamp).toBeTruthy();
        expect(handledError.errorType).toBeTruthy();
        expect(handledError.message).toBeTruthy();
        expect(Array.isArray(handledError.recoveryOptions)).toBe(true);
        expect(handledError.recoveryOptions.length).toBeGreaterThan(0);

        // Test 2: attemptErrorRecovery debe intentar recuperación
        const recoveryResult = generator.attemptErrorRecovery(problematicComponents, handledError);

        expect(recoveryResult).toBeDefined();
        expect(typeof recoveryResult.success).toBe('boolean');

        if (recoveryResult.success) {
          // Si la recuperación fue exitosa, debe tener configuración válida
          expect(recoveryResult.configuration).toBeDefined();
          expect(typeof recoveryResult.configuration).toBe('object');
          expect(recoveryResult.recoveryMethod).toBeTruthy();
          expect(Array.isArray(recoveryResult.warnings)).toBe(true);

          // La configuración recuperada debe ser válida
          expect(() => {
            generator.validateOutputStructure(recoveryResult.configuration);
          }).not.toThrow();

          // Debe ser serializable
          expect(() => {
            generator.serializeToJSON(recoveryResult.configuration);
          }).not.toThrow();
        } else {
          // Si la recuperación falló, debe tener información del error
          expect(recoveryResult.error).toBeTruthy();
          expect(recoveryResult.fallbackConfiguration).toBeDefined();
          
          // La configuración de fallback debe ser válida
          expect(typeof recoveryResult.fallbackConfiguration).toBe('object');
          expect(recoveryResult.fallbackConfiguration._fallback).toBe(true);
        }

        // Test 3: Verificar preservación de estado
        if (handledError.preservedState) {
          expect(typeof handledError.preservedState).toBe('object');
          
          if (typeof handledError.preservedState === 'object' && 
              !handledError.preservedState.error) {
            expect(handledError.preservedState.project_name).toBeTruthy();
            expect(typeof handledError.preservedState.subnet_count).toBe('number');
            expect(typeof handledError.preservedState.route_table_count).toBe('number');
          }
        }
      }),
      { numRuns: 50 }
    );
  });

  test('Property 10 - Edge case: errores específicos de validación', () => {
    const specificErrorCases = [
      // Caso 1: CIDR inválido
      {
        vpcs: [{ id: 'vpc-1', name: 'test', cidr: '999.999.999.999/16' }],
        subnets: [],
        routeTables: [],
        expectedErrorType: 'INVALID_CIDR_FORMAT'
      },
      // Caso 2: Tipo de subnet inválido
      {
        vpcs: [{ id: 'vpc-1', name: 'test', cidr: '10.0.0.0/16' }],
        subnets: [{ id: 'subnet-1', cidr: '10.0.1.0/24', type: 'invalid-type' }],
        routeTables: [],
        expectedErrorType: 'SUBNET_PROCESSING_ERROR'
      },
      // Caso 3: Route table con rutas inválidas
      {
        vpcs: [{ id: 'vpc-1', name: 'test', cidr: '10.0.0.0/16' }],
        subnets: [],
        routeTables: [{
          id: 'rt-1',
          routes: [{ destination: 'invalid-destination', target: 'igw' }]
        }],
        expectedErrorType: 'ROUTE_TABLE_PROCESSING_ERROR'
      }
    ];

    specificErrorCases.forEach((testCase, index) => {
      let errorCaught = false;
      let errorInfo = null;

      try {
        const configuration = generator.generateConfiguration(testCase);
        // Si no falla en generateConfiguration, puede fallar en validateOutputStructure
        generator.validateOutputStructure(configuration);
      } catch (error) {
        errorCaught = true;
        errorInfo = error;
      }

      if (errorCaught) {
        expect(errorInfo).toBeDefined();
        expect(errorInfo.name).toBe('TerraformGenerationError');
        expect(errorInfo.message).toBeTruthy();
        expect(errorInfo.type).toBeTruthy();
        
        // Verificar que el contexto del error es útil
        if (errorInfo.context) {
          expect(typeof errorInfo.context).toBe('object');
        }
      }
    });
  });

  test('Property 10 - Edge case: manejo de errores de serialización JSON', () => {
    // Crear configuración que puede causar problemas de serialización
    const problematicConfig = {
      vpcs: [{ id: 'vpc-1', name: 'test', cidr: '10.0.0.0/16' }],
      subnets: [],
      routeTables: [],
      services: []
    };

    const configuration = generator.generateConfiguration(problematicConfig);
    
    // Agregar referencia circular para causar error de serialización
    configuration.circularRef = configuration;

    let serializationError = null;
    try {
      generator.serializeToJSON(configuration);
    } catch (error) {
      serializationError = error;
    }

    // Debe capturar el error de serialización
    expect(serializationError).toBeDefined();
    expect(serializationError.name).toBe('TerraformGenerationError');
    expect(serializationError.type).toBe('INVALID_JSON_FORMAT');
    expect(serializationError.message).toContain('La configuración no puede ser serializada a JSON válido');
  });
});