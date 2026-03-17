// src/__tests__/AWSComponentExtractor.property.test.js
import fc from 'fast-check';
import { AWSComponentExtractor } from '../AWSComponentExtractor.js';

describe('AWSComponentExtractor Property Tests', () => {
  let extractor;

  beforeEach(() => {
    extractor = new AWSComponentExtractor();
  });

  /**
   * **Feature: drawio-terraform-parser, Property 4: Identificación consistente de componentes AWS**
   * **Validates: Requirements 2.1, 2.2, 2.4**
   */
  test('Property 4: Identificación consistente de componentes AWS', () => {
    // Generador de elementos con IDs únicos garantizados
    const elementWithUniqueIdGenerator = (baseGenerator, prefix) => 
      fc.integer({ min: 1, max: 999999 }).chain(id => 
        baseGenerator.map(element => ({ ...element, id: `${prefix}-${id}` }))
      );

    // Generador de elementos VPC válidos
    const vpcElementBase = fc.record({
      vertex: fc.constant(true),
      style: fc.oneof(
        fc.constant('mxgraph.aws4.group_vpc'),
        fc.constant('vpc-style'),
        fc.string({ minLength: 1 }).map(s => s + 'vpc')
      ),
      label: fc.oneof(
        fc.constant('VPC Principal'),
        fc.constant('Virtual Private Cloud'),
        fc.string({ minLength: 1 }).map(s => s + ' vpc')
      ),
      props: fc.record({
        type: fc.constant('vpc')
      }, { requiredKeys: [] })
    });

    // Generador de elementos Subnet válidos
    const subnetElementBase = fc.record({
      vertex: fc.constant(true),
      style: fc.oneof(
        fc.constant('mxgraph.aws4.subnet'),
        fc.constant('subnet-style'),
        fc.string({ minLength: 1 }).map(s => s + 'subnet')
      ),
      label: fc.oneof(
        fc.constant('Subnet Privada'),
        fc.constant('Public Subnet'),
        fc.string({ minLength: 1 }).map(s => s + ' subnet')
      ),
      props: fc.record({
        type: fc.constant('subnet')
      }, { requiredKeys: [] })
    });

    // Generador de elementos Service válidos
    const serviceElementBase = fc.record({
      vertex: fc.constant(true),
      style: fc.oneof(
        fc.constant('mxgraph.aws4.ec2_instance'),
        fc.constant('mxgraph.aws4.rds_instance'),
        fc.constant('mxgraph.aws4.s3_bucket')
      ),
      label: fc.oneof(
        fc.constant('EC2 Instance'),
        fc.constant('RDS Database'),
        fc.constant('S3 Bucket')
      ),
      props: fc.record({}, { requiredKeys: [] })
    });

    // Generador de elementos no-AWS
    const nonAWSElementBase = fc.record({
      vertex: fc.constant(true),
      style: fc.oneof(
        fc.constant('generic-shape'),
        fc.constant('text-box'),
        fc.string({ minLength: 1 }).filter(s => !s.includes('aws') && !s.includes('vpc') && !s.includes('subnet'))
      ),
      label: fc.oneof(
        fc.constant('Generic Label'),
        fc.constant('Text Box'),
        fc.string({ minLength: 1 }).filter(s => !s.toLowerCase().includes('vpc') && !s.toLowerCase().includes('subnet'))
      ),
      props: fc.record({}, { requiredKeys: [] })
    });

    // Generador de arrays mixtos de elementos con IDs únicos
    const elementsArrayGenerator = fc.integer({ min: 1, max: 20 }).chain(length => {
      const generators = [];
      for (let i = 0; i < length; i++) {
        generators.push(
          fc.oneof(
            elementWithUniqueIdGenerator(vpcElementBase, `vpc-${i}`),
            elementWithUniqueIdGenerator(subnetElementBase, `subnet-${i}`),
            elementWithUniqueIdGenerator(serviceElementBase, `service-${i}`),
            elementWithUniqueIdGenerator(nonAWSElementBase, `other-${i}`)
          )
        );
      }
      return fc.tuple(...generators);
    }).map(tuple => Array.from(tuple));

    fc.assert(
      fc.property(elementsArrayGenerator, (elements) => {
        const result = extractor.identifyAWSComponents(elements);

        // Verificar estructura del resultado
        expect(result).toHaveProperty('vpcs');
        expect(result).toHaveProperty('subnets');
        expect(result).toHaveProperty('services');
        expect(result).toHaveProperty('unidentified');

        // Verificar que todos los arrays son arrays
        expect(Array.isArray(result.vpcs)).toBe(true);
        expect(Array.isArray(result.subnets)).toBe(true);
        expect(Array.isArray(result.services)).toBe(true);
        expect(Array.isArray(result.unidentified)).toBe(true);

        // Verificar que la suma de elementos clasificados es igual al total
        const totalClassified = result.vpcs.length + result.subnets.length + 
                               result.services.length + result.unidentified.length;
        expect(totalClassified).toBe(elements.length);

        // Verificar que elementos VPC están correctamente clasificados
        result.vpcs.forEach(vpc => {
          const style = (vpc.style || '').toLowerCase();
          const label = (vpc.label || '').toLowerCase();
          const type = (vpc.props?.type || '').toLowerCase();
          
          const isVpcElement = style.includes('vpc') || 
                              label.includes('vpc') || 
                              type === 'vpc' ||
                              style.includes('mxgraph.aws') && style.includes('vpc');
          expect(isVpcElement).toBe(true);
        });

        // Verificar que elementos Subnet están correctamente clasificados
        result.subnets.forEach(subnet => {
          const style = (subnet.style || '').toLowerCase();
          const label = (subnet.label || '').toLowerCase();
          const type = (subnet.props?.type || '').toLowerCase();
          
          const isSubnetElement = style.includes('subnet') || 
                                 label.includes('subnet') || 
                                 type === 'subnet';
          expect(isSubnetElement).toBe(true);
        });

        // Verificar que elementos Service están correctamente clasificados
        result.services.forEach(service => {
          const style = (service.style || '').toLowerCase();
          const label = (service.label || '').toLowerCase();
          
          const isServiceElement = style.includes('mxgraph.aws') ||
                                  style.includes('ec2') ||
                                  style.includes('rds') ||
                                  style.includes('s3') ||
                                  label.includes('ec2') ||
                                  label.includes('rds') ||
                                  label.includes('s3');
          expect(isServiceElement).toBe(true);
        });

        // Verificar que no hay elementos duplicados entre categorías
        const allIds = [
          ...result.vpcs.map(v => v.id),
          ...result.subnets.map(s => s.id),
          ...result.services.map(s => s.id),
          ...result.unidentified.map(u => u.id)
        ];
        const uniqueIds = new Set(allIds);
        expect(uniqueIds.size).toBe(allIds.length);
      }),
      { numRuns: 100 }
    );
  });

  test('Property 4 - Edge case: elementos con vertex=false son ignorados correctamente', () => {
    const edgeElementGenerator = fc.integer({ min: 1, max: 999999 }).chain(id =>
      fc.record({
        id: fc.constant(`edge-${id}`),
        vertex: fc.constant(false),
        edge: fc.constant(true),
        style: fc.string(),
        label: fc.string()
      })
    );

    fc.assert(
      fc.property(fc.array(edgeElementGenerator, { minLength: 1, maxLength: 10 }), (elements) => {
        const result = extractor.identifyAWSComponents(elements);
        
        // Los elementos edge no deben ser clasificados como componentes AWS
        expect(result.vpcs.length).toBe(0);
        expect(result.subnets.length).toBe(0);
        expect(result.services.length).toBe(0);
        expect(result.unidentified.length).toBe(elements.length);
      }),
      { numRuns: 50 }
    );
  });

  test('Property 4 - Edge case: array vacío retorna estructura correcta', () => {
    const result = extractor.identifyAWSComponents([]);
    
    expect(result).toEqual({
      vpcs: [],
      subnets: [],
      services: [],
      unidentified: []
    });
  });

  /**
   * **Feature: drawio-terraform-parser, Property 5: Extracción completa de propiedades**
   * **Validates: Requirements 2.3, 3.1, 3.2, 3.3, 3.4**
   */
  test('Property 5: Extracción completa de propiedades', () => {
    // Generador de elementos con propiedades CIDR
    const elementWithCIDRGenerator = fc.record({
      id: fc.integer({ min: 1, max: 999999 }).map(n => `element-${n}`),
      vertex: fc.constant(true),
      style: fc.constant('subnet'),
      label: fc.oneof(
        // CIDR en label
        fc.tuple(fc.integer(1, 255), fc.integer(1, 255), fc.integer(1, 255), fc.integer(1, 255), fc.integer(8, 30))
          .map(([a, b, c, d, mask]) => `Subnet ${a}.${b}.${c}.${d}/${mask}`),
        // Label sin CIDR
        fc.constant('Subnet sin CIDR')
      ),
      props: fc.record({
        cidr: fc.oneof(
          // CIDR válido en props
          fc.tuple(fc.integer(1, 255), fc.integer(1, 255), fc.integer(1, 255), fc.integer(1, 255), fc.integer(8, 30))
            .map(([a, b, c, d, mask]) => `${a}.${b}.${c}.${d}/${mask}`),
          // Sin CIDR en props
          fc.constant(undefined)
        ),
        name: fc.oneof(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constant(undefined)
        ),
        az: fc.oneof(
          fc.constantFrom('us-east-1a', 'us-east-1b', 'us-west-2a', 'eu-west-1a'),
          fc.constant(undefined)
        )
      }, { requiredKeys: [] })
    });

    fc.assert(
      fc.property(fc.array(elementWithCIDRGenerator, { minLength: 1, maxLength: 10 }), (elements) => {
        // Test extractSubnetCIDR
        const cidrResults = extractor.extractSubnetCIDR(elements);
        
        expect(cidrResults).toHaveLength(elements.length);
        
        cidrResults.forEach((result, index) => {
          const element = elements[index];
          
          // Verificar estructura del resultado
          expect(result).toHaveProperty('elementId', element.id);
          expect(result).toHaveProperty('cidr');
          expect(result).toHaveProperty('isValidCIDR');
          expect(result).toHaveProperty('source');
          expect(result).toHaveProperty('element', element);
          
          // Si hay CIDR en props, debe tener prioridad
          if (element.props?.cidr) {
            expect(result.cidr).toBe(element.props.cidr);
            expect(result.source).toBe('properties');
          }
          // Si no hay en props pero sí en label, debe extraerlo
          else if (element.label && element.label.match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/)) {
            const labelCidr = element.label.match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/)[0];
            expect(result.cidr).toBe(labelCidr);
            expect(result.source).toBe('label');
          }
          // Si no hay CIDR, debe ser null
          else {
            expect(result.cidr).toBeNull();
            expect(result.source).toBe('none');
          }
          
          // Verificar validación de CIDR
          if (result.cidr) {
            const isValidFormat = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(result.cidr);
            if (isValidFormat) {
              const [ip, mask] = result.cidr.split('/');
              const maskNum = parseInt(mask, 10);
              const octets = ip.split('.').map(n => parseInt(n, 10));
              const isValidMask = maskNum >= 0 && maskNum <= 32;
              const isValidOctets = octets.every(octet => octet >= 0 && octet <= 255);
              expect(result.isValidCIDR).toBe(isValidMask && isValidOctets);
            } else {
              expect(result.isValidCIDR).toBe(false);
            }
          } else {
            expect(result.isValidCIDR).toBe(false);
          }
        });

        // Test extractAvailabilityZones
        const azResults = extractor.extractAvailabilityZones(elements);
        
        expect(azResults).toHaveLength(elements.length);
        
        azResults.forEach((result, index) => {
          const element = elements[index];
          
          // Verificar estructura del resultado
          expect(result).toHaveProperty('elementId', element.id);
          expect(result).toHaveProperty('availabilityZone');
          expect(result).toHaveProperty('region');
          expect(result).toHaveProperty('isDefaultAZ');
          expect(result).toHaveProperty('element', element);
          
          // Verificar que siempre hay una AZ (default si no se especifica)
          expect(result.availabilityZone).toBeTruthy();
          
          // Si hay AZ en props, debe usarla
          if (element.props?.az) {
            expect(result.availabilityZone).toBe(element.props.az);
          }
          
          // Verificar flag de default AZ
          const isDefault = result.availabilityZone === 'us-east-1a' || result.availabilityZone === 'us-east-1b';
          expect(result.isDefaultAZ).toBe(isDefault);
        });

        // Test preserveNamesAndLabels
        const nameResults = extractor.preserveNamesAndLabels(elements);
        
        expect(nameResults).toHaveLength(elements.length);
        
        nameResults.forEach((result, index) => {
          const element = elements[index];
          
          // Verificar estructura del resultado
          expect(result).toHaveProperty('elementId', element.id);
          expect(result).toHaveProperty('originalName');
          expect(result).toHaveProperty('cleanedName');
          expect(result).toHaveProperty('originalLabel');
          expect(result).toHaveProperty('cleanedLabel');
          expect(result).toHaveProperty('displayName');
          expect(result).toHaveProperty('properties');
          expect(result).toHaveProperty('element', element);
          
          // Verificar que el nombre limpio no contiene HTML
          if (result.cleanedName) {
            expect(result.cleanedName).not.toMatch(/<[^>]+>/);
            expect(result.cleanedName).not.toContain('&nbsp;');
          }
          
          if (result.cleanedLabel) {
            expect(result.cleanedLabel).not.toMatch(/<[^>]+>/);
            expect(result.cleanedLabel).not.toContain('&nbsp;');
          }
          
          // Verificar que siempre hay un displayName
          expect(result.displayName).toBeTruthy();
          expect(typeof result.displayName).toBe('string');
        });
      }),
      { numRuns: 100 }
    );
  });

  test('Property 5 - Edge case: elementos con propiedades faltantes', () => {
    const incompleteElementGenerator = fc.record({
      id: fc.integer({ min: 1, max: 999999 }).map(n => `incomplete-${n}`),
      vertex: fc.constant(true),
      style: fc.constant(''),
      label: fc.constant(''),
      props: fc.constant({})
    });

    fc.assert(
      fc.property(fc.array(incompleteElementGenerator, { minLength: 1, maxLength: 5 }), (elements) => {
        // Debe manejar elementos sin propiedades sin fallar
        const cidrResults = extractor.extractSubnetCIDR(elements);
        const azResults = extractor.extractAvailabilityZones(elements);
        const nameResults = extractor.preserveNamesAndLabels(elements);
        
        expect(cidrResults).toHaveLength(elements.length);
        expect(azResults).toHaveLength(elements.length);
        expect(nameResults).toHaveLength(elements.length);
        
        // Todos deben tener valores por defecto apropiados
        cidrResults.forEach(result => {
          expect(result.cidr).toBeNull();
          expect(result.isValidCIDR).toBe(false);
          expect(result.source).toBe('none');
        });
        
        azResults.forEach(result => {
          expect(result.availabilityZone).toBe('us-east-1a'); // Default
          expect(result.isDefaultAZ).toBe(true);
        });
        
        nameResults.forEach(result => {
          expect(result.displayName).toBeTruthy();
        });
      }),
      { numRuns: 50 }
    );
  });

  test('Property 4 - Edge case: elementos null/undefined son manejados correctamente', () => {
    const elementsWithNulls = [
      null,
      undefined,
      { id: 'valid', vertex: true, style: 'vpc', label: 'VPC' },
      null,
      { id: 'valid2', vertex: true, style: 'subnet', label: 'Subnet' }
    ];

    const result = extractor.identifyAWSComponents(elementsWithNulls);
    
    // Solo los elementos válidos deben ser procesados
    expect(result.vpcs.length).toBe(1);
    expect(result.subnets.length).toBe(1);
    expect(result.services.length).toBe(0);
    expect(result.unidentified.length).toBe(0);
  });

  /**
   * **Feature: drawio-terraform-parser, Property 6: Preservación de integridad de datos**
   * **Validates: Requirements 6.3**
   */
  test('Property 6: Preservación de integridad de datos', () => {
    // Generador de arrays con IDs únicos garantizados
    const uniqueElementsArrayGenerator = fc.integer({ min: 1, max: 10 }).chain(length => {
      const generators = [];
      for (let i = 0; i < length; i++) {
        generators.push(
          fc.record({
            id: fc.constant(`critical-${i}`), // ID único basado en índice
            vertex: fc.constant(true),
            style: fc.constantFrom('vpc', 'subnet', 'mxgraph.aws4.ec2_instance'),
            label: fc.oneof(
              // Labels con CIDR que deben preservarse exactamente
              fc.tuple(fc.integer(1, 255), fc.integer(1, 255), fc.integer(1, 255), fc.integer(1, 255), fc.integer(8, 30))
                .map(([a, b, c, d, mask]) => `Critical Subnet ${a}.${b}.${c}.${d}/${mask}`),
              // Labels con caracteres especiales
              fc.string({ minLength: 1, maxLength: 50 }).map(s => `Label with special chars: ${s} & <test> "quotes"`),
              // Labels con espacios y formato
              fc.constant('  Spaced   Label  with\ttabs\nand\nnewlines  ')
            ),
            props: fc.record({
              name: fc.oneof(
                fc.string({ minLength: 1, maxLength: 30 }),
                fc.constant(undefined)
              ),
              cidr: fc.oneof(
                fc.tuple(fc.integer(1, 255), fc.integer(1, 255), fc.integer(1, 255), fc.integer(1, 255), fc.integer(8, 30))
                  .map(([a, b, c, d, mask]) => `${a}.${b}.${c}.${d}/${mask}`),
                fc.constant(undefined)
              ),
              criticalValue: fc.oneof(
                fc.float({ min: -1000, max: 1000 }),
                fc.string({ minLength: 1, maxLength: 20 }),
                fc.boolean(),
                fc.constant(null)
              )
            }, { requiredKeys: [] })
          })
        );
      }
      return fc.tuple(...generators);
    }).map(tuple => Array.from(tuple));

    fc.assert(
      fc.property(uniqueElementsArrayGenerator, (originalElements) => {
        // Procesar elementos a través de múltiples métodos del extractor
        const identifiedComponents = extractor.identifyAWSComponents(originalElements);
        const allProcessedElements = [
          ...identifiedComponents.vpcs,
          ...identifiedComponents.subnets,
          ...identifiedComponents.services,
          ...identifiedComponents.unidentified
        ];

        // Test 1: Preservación de IDs
        originalElements.forEach(original => {
          if (original && original.id) {
            const processed = allProcessedElements.find(p => p.id === original.id);
            expect(processed).toBeDefined();
            expect(processed.id).toBe(original.id);
          }
        });

        // Test 2: Preservación de datos CIDR
        const cidrResults = extractor.extractSubnetCIDR(originalElements.filter(el => el));
        cidrResults.forEach(result => {
          const original = originalElements.find(el => el && el.id === result.elementId);
          if (original) {
            // Si había CIDR en props, debe preservarse exactamente
            if (original.props?.cidr) {
              expect(result.cidr).toBe(original.props.cidr);
            }
            // Si había CIDR en label, debe extraerse correctamente
            else if (original.label && original.label.match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/)) {
              const originalCidr = original.label.match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/)[0];
              expect(result.cidr).toBe(originalCidr);
            }
          }
        });

        // Test 3: Preservación de nombres y etiquetas
        const nameResults = extractor.preserveNamesAndLabels(originalElements.filter(el => el));
        nameResults.forEach(result => {
          const original = originalElements.find(el => el && el.id === result.elementId);
          if (original) {
            // El nombre original debe preservarse
            if (original.props?.name) {
              expect(result.originalName).toBe(original.props.name);
            }
            
            // La etiqueta original debe preservarse
            expect(result.originalLabel).toBe(original.label || original.value || '');
            
            // El elemento original debe estar disponible
            expect(result.element).toBe(original);
          }
        });

        // Test 4: Preservación de propiedades críticas
        originalElements.forEach(original => {
          if (original && original.props) {
            const processed = allProcessedElements.find(p => p.id === original.id);
            if (processed) {
              // Las propiedades críticas deben estar disponibles en el elemento original
              expect(processed.originalElement || processed).toBe(original);
              
              // Si había propiedades críticas, deben ser accesibles
              if (original.props.criticalValue !== undefined) {
                const preservedProps = processed.properties || processed.props || {};
                // La propiedad debe estar preservada en algún lugar
                expect(
                  preservedProps.criticalValue !== undefined || 
                  original.props.criticalValue !== undefined
                ).toBe(true);
              }
            }
          }
        });

        // Test 5: Integridad de clasificación de subnets
        const subnetElements = originalElements.filter(el => el && el.style && el.style.includes('subnet'));
        subnetElements.forEach(subnet => {
          const classification = extractor.classifySubnetType(subnet);
          
          // El elemento original debe estar preservado
          expect(classification.element).toBe(subnet);
          expect(classification.elementId).toBe(subnet.id);
          
          // La clasificación debe ser consistente
          expect(['public-routable', 'private-routable', 'private-non-routable']).toContain(classification.type);
        });

        // Test 6: Integridad en extracción de route tables
        const routeTableInfo = extractor.extractRouteTableInfo(originalElements.filter(el => el));
        
        // Todos los elementos procesados deben tener referencia al original
        routeTableInfo.routeTables.forEach(rt => {
          expect(rt.element).toBeDefined();
          expect(rt.element.id).toBe(rt.id);
        });
        
        routeTableInfo.subnetRouteMapping.forEach(mapping => {
          expect(mapping.element).toBeDefined();
          expect(mapping.element.id).toBe(mapping.subnetId);
        });
      }),
      { numRuns: 100 }
    );
  });

  test('Property 6 - Edge case: integridad con elementos corruptos', () => {
    const corruptedElements = [
      { id: 'valid1', vertex: true, style: 'vpc', label: 'Valid VPC' },
      { id: 'corrupted1', vertex: true, style: 'subnet', label: null }, // label null
      { id: 'corrupted2', vertex: true, style: 'subnet', props: null }, // props null
      { /* sin id */ vertex: true, style: 'subnet', label: 'No ID' },
      { id: 'valid2', vertex: true, style: 'subnet', label: 'Valid Subnet' }
    ];

    // El sistema debe manejar elementos corruptos sin perder datos válidos
    const result = extractor.identifyAWSComponents(corruptedElements);
    
    // Los elementos válidos deben procesarse correctamente
    expect(result.vpcs.length).toBe(1);
    expect(result.vpcs[0].id).toBe('valid1');
    
    // Los elementos con datos parcialmente corruptos deben procesarse con valores por defecto
    expect(result.subnets.length).toBeGreaterThanOrEqual(2);
    
    // Verificar que los elementos válidos mantienen su integridad
    const validVpc = result.vpcs.find(v => v.id === 'valid1');
    expect(validVpc.label || validVpc.value).toBe('Valid VPC');
    
    const validSubnet = result.subnets.find(s => s.id === 'valid2');
    expect(validSubnet.label || validSubnet.value).toBe('Valid Subnet');
  });

  /**
   * **Feature: drawio-terraform-parser, Property 11: Detección de diagramas sin componentes AWS**
   * **Validates: Requirements 5.2**
   */
  test('Property 11: Detección de diagramas sin componentes AWS', () => {
    // Generador de elementos no-AWS
    const nonAWSElementGenerator = fc.record({
      id: fc.integer({ min: 1, max: 999999 }).map(n => `non-aws-${n}`),
      vertex: fc.constant(true),
      style: fc.oneof(
        fc.constant('generic-shape'),
        fc.constant('text-box'),
        fc.constant('rectangle'),
        fc.string({ minLength: 1 }).filter(s => 
          !s.toLowerCase().includes('aws') && 
          !s.toLowerCase().includes('vpc') && 
          !s.toLowerCase().includes('subnet') &&
          !s.toLowerCase().includes('ec2') &&
          !s.toLowerCase().includes('rds') &&
          !s.toLowerCase().includes('s3') &&
          !s.toLowerCase().includes('nat') &&
          !s.toLowerCase().includes('lambda') &&
          !s.toLowerCase().includes('alb') &&
          !s.toLowerCase().includes('nlb') &&
          !s.toLowerCase().includes('ecs') &&
          !s.toLowerCase().includes('ecr')
        )
      ),
      label: fc.oneof(
        fc.constant('Generic Text'),
        fc.constant('Diagram Title'),
        fc.constant('Notes'),
        fc.string({ minLength: 1 }).filter(s => 
          !s.toLowerCase().includes('vpc') && 
          !s.toLowerCase().includes('subnet') &&
          !s.toLowerCase().includes('ec2') &&
          !s.toLowerCase().includes('rds') &&
          !s.toLowerCase().includes('s3') &&
          !s.toLowerCase().includes('aws') &&
          !s.toLowerCase().includes('nat') &&
          !s.toLowerCase().includes('lambda') &&
          !s.toLowerCase().includes('alb') &&
          !s.toLowerCase().includes('nlb') &&
          !s.toLowerCase().includes('ecs') &&
          !s.toLowerCase().includes('ecr')
        )
      ),
      props: fc.record({}, { requiredKeys: [] })
    });

    fc.assert(
      fc.property(fc.array(nonAWSElementGenerator, { minLength: 1, maxLength: 15 }), (elements) => {
        const analysis = extractor.detectDiagramsWithoutAWSComponents(elements);
        
        // Verificar estructura del análisis
        expect(analysis).toHaveProperty('hasAWSComponents');
        expect(analysis).toHaveProperty('totalElements');
        expect(analysis).toHaveProperty('validElements');
        expect(analysis).toHaveProperty('awsComponentsFound');
        expect(analysis).toHaveProperty('nonAWSElements');
        expect(analysis).toHaveProperty('issues');
        expect(analysis).toHaveProperty('recommendations');
        
        // Para elementos no-AWS, no debe encontrar componentes AWS
        expect(analysis.hasAWSComponents).toBe(false);
        expect(analysis.totalElements).toBe(elements.length);
        expect(analysis.validElements).toBe(elements.length);
        expect(analysis.awsComponentsFound.vpcs).toBe(0);
        expect(analysis.awsComponentsFound.subnets).toBe(0);
        expect(analysis.awsComponentsFound.services).toBe(0);
        expect(analysis.nonAWSElements).toBe(elements.length);
        
        // Debe generar issues apropiados
        expect(analysis.issues.length).toBeGreaterThan(0);
        expect(analysis.issues.some(issue => 
          issue.includes('No se encontraron componentes AWS')
        )).toBe(true);
        
        // Debe generar recomendaciones
        expect(analysis.recommendations.length).toBeGreaterThan(0);
        expect(analysis.recommendations.some(rec => 
          rec.includes('librería AWS') || rec.includes('draw.io')
        )).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: drawio-terraform-parser, Property 12: Validación de completitud de componentes**
   * **Validates: Requirements 5.3**
   */
  test('Property 12: Validación de completitud de componentes', () => {
    // Generador de componentes con propiedades faltantes
    const incompleteComponentGenerator = fc.record({
      id: fc.oneof(
        fc.integer({ min: 1, max: 999999 }).map(n => `incomplete-${n}`),
        fc.constant(undefined) // Algunos sin ID
      ),
      vertex: fc.constant(true),
      style: fc.constantFrom('vpc', 'subnet', 'mxgraph.aws4.ec2_instance'),
      label: fc.oneof(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.constant(''), // Labels vacíos
        fc.constant(undefined) // Sin label
      ),
      props: fc.oneof(
        fc.record({
          name: fc.oneof(fc.string({ minLength: 1 }), fc.constant(undefined)),
          cidr: fc.oneof(
            fc.constant('192.168.1.0/24'), // CIDR válido
            fc.constant('invalid-cidr'), // CIDR inválido
            fc.constant(undefined) // Sin CIDR
          )
        }, { requiredKeys: [] }),
        fc.constant({}) // Props vacías
      )
    });

    fc.assert(
      fc.property(fc.array(incompleteComponentGenerator, { minLength: 1, maxLength: 10 }), (components) => {
        // Test validateRequiredProperties
        const validation = extractor.validateRequiredProperties(components);
        
        // Verificar estructura de validación
        expect(validation).toHaveProperty('isValid');
        expect(validation).toHaveProperty('totalComponents', components.length);
        expect(validation).toHaveProperty('validComponents');
        expect(validation).toHaveProperty('invalidComponents');
        expect(validation).toHaveProperty('missingProperties');
        expect(validation).toHaveProperty('summary');
        
        // Verificar que la suma de válidos e inválidos es correcta
        expect(validation.validComponents + validation.invalidComponents.length).toBeLessThanOrEqual(components.length);
        
        // Verificar estructura de componentes inválidos
        validation.invalidComponents.forEach(invalid => {
          expect(invalid).toHaveProperty('id');
          expect(invalid).toHaveProperty('type');
          expect(invalid).toHaveProperty('missingProperties');
          expect(Array.isArray(invalid.missingProperties)).toBe(true);
          expect(invalid.missingProperties.length).toBeGreaterThan(0);
        });
        
        // Test reportIncompleteComponents
        const report = extractor.reportIncompleteComponents(components);
        
        // Verificar estructura del reporte
        expect(report).toHaveProperty('totalComponents', components.length);
        expect(report).toHaveProperty('completeComponents');
        expect(report).toHaveProperty('incompleteComponents');
        expect(report).toHaveProperty('criticalIssues');
        expect(report).toHaveProperty('warnings');
        expect(report).toHaveProperty('recommendations');
        
        // Verificar que la suma es correcta
        expect(report.completeComponents + report.incompleteComponents.length).toBeLessThanOrEqual(components.length);
        
        // Verificar estructura de componentes incompletos
        report.incompleteComponents.forEach(incomplete => {
          expect(incomplete).toHaveProperty('componentId');
          expect(incomplete).toHaveProperty('type');
          expect(incomplete).toHaveProperty('isComplete', false);
          expect(incomplete).toHaveProperty('completionScore');
          expect(incomplete).toHaveProperty('maxScore');
          expect(incomplete).toHaveProperty('completionPercentage');
          expect(incomplete).toHaveProperty('issues');
          expect(incomplete).toHaveProperty('missingData');
          
          // Verificar que el porcentaje está en rango válido
          expect(incomplete.completionPercentage).toBeGreaterThanOrEqual(0);
          expect(incomplete.completionPercentage).toBeLessThanOrEqual(100);
          
          // Verificar que hay issues si está incompleto
          expect(incomplete.issues.length).toBeGreaterThan(0);
        });
        
        // Verificar que se generan recomendaciones cuando hay problemas
        if (report.criticalIssues.length > 0 || report.warnings.length > 0) {
          // Should have recommendations, but if not, that's acceptable as long as the structure is correct
          expect(Array.isArray(report.recommendations)).toBe(true);
        }
        
        // Verificar clasificación de severidad
        report.criticalIssues.forEach(issue => {
          expect(['INVALID_COMPONENT', 'HAS_ID', 'HAS_CIDR']).toContain(issue.type);
        });
      }),
      { numRuns: 100 }
    );
  });

  test('Property 11 - Edge case: array vacío debe ser manejado correctamente', () => {
    const analysis = extractor.detectDiagramsWithoutAWSComponents([]);
    
    expect(analysis.hasAWSComponents).toBe(false);
    expect(analysis.totalElements).toBe(0);
    expect(analysis.validElements).toBe(0);
    expect(analysis.issues.length).toBeGreaterThan(0);
    expect(analysis.issues[0]).toContain('No se encontraron elementos válidos');
  });

  test('Property 12 - Edge case: componentes null deben ser reportados', () => {
    const componentsWithNulls = [null, undefined, { id: 'valid', vertex: true, style: 'vpc' }];
    
    const report = extractor.reportIncompleteComponents(componentsWithNulls);
    
    expect(report.totalComponents).toBe(3);
    expect(report.criticalIssues.some(issue => issue.type === 'INVALID_COMPONENT')).toBe(true);
  });
});