/**
 * Property-based tests for DrawIO Terraform Parser
 * Feature: drawio-terraform-parser
 */

import fc from 'fast-check';
import { XMLParser } from '../XMLParser.js';
import { AWSComponentExtractor } from '../AWSComponentExtractor.js';

describe('DrawIO Parser Property Tests', () => {
  
  /**
   * Feature: drawio-terraform-parser, Property 1: Archivos draw.io válidos son siempre parseables
   * Validates: Requirements 1.1, 1.2
   */
  test('Property 1: Valid draw.io files are always parseable', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateValidDrawIOXML(),
        async (validXML) => {
          const xmlParser = new XMLParser();
          
          // Valid draw.io XML should always be parseable without throwing errors
          let result;
          try {
            const xmlDoc = xmlParser._parseXMLContent(validXML);
            result = xmlParser.extractGraphElements(xmlDoc);
          } catch (error) {
            throw new Error(`Valid draw.io XML failed to parse: ${error.message}`);
          }
          
          // Result should be a valid mxGraphModel object
          expect(result).toBeDefined();
          expect(typeof result).toBe('object');
          
          // Should have root element
          expect(result).toHaveProperty('root');
          
          return true; // Explicitly return true for property test
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: drawio-terraform-parser, Property 2: Archivos XML inválidos son siempre rechazados
   * Validates: Requirements 1.3, 1.4
   */
  test('Property 2: Invalid XML files are always rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateInvalidXML(),
        async (invalidXML) => {
          const xmlParser = new XMLParser();
          
          // Invalid XML should always be rejected with a specific error
          let threwError = false;
          try {
            const xmlDoc = xmlParser._parseXMLContent(invalidXML);
            // If parsing succeeds, try validation which should fail for non-draw.io XML
            xmlParser.validateDrawIOFormat(xmlDoc);
          } catch (error) {
            threwError = true;
          }
          
          // Must throw an error for invalid XML or invalid draw.io format
          expect(threwError).toBe(true);
          return true; // Explicitly return true for property test
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: drawio-terraform-parser, Property 3: Validación de esquema draw.io
   * Validates: Requirements 6.1
   */
  test('Property 3: Draw.io schema validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateValidDrawIOXML(),
        async (validXML) => {
          const xmlParser = new XMLParser();
          
          // Parse the XML content first
          const xmlDoc = xmlParser._parseXMLContent(validXML);
          
          // Valid draw.io XML should always pass schema validation
          let validationPassed = false;
          try {
            const isValid = xmlParser.validateDrawIOFormat(xmlDoc);
            validationPassed = isValid === true;
          } catch (error) {
            throw new Error(`Valid draw.io XML failed schema validation: ${error.message}`);
          }
          
          expect(validationPassed).toBe(true);
          
          // Should also be able to extract graph elements successfully
          const graphModel = xmlParser.extractGraphElements(xmlDoc);
          expect(graphModel).toBeDefined();
          expect(typeof graphModel).toBe('object');
          
          return true; // Explicitly return true for property test
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Generator for valid draw.io XML content
 */
function generateValidDrawIOXML() {
  return fc.record({
    cells: fc.array(generateValidCell(), { minLength: 0, maxLength: 5 }),
    format: fc.constantFrom('mxGraphModel', 'mxfile', 'diagram')
  }).map(({ cells, format }) => {
    // Ensure unique IDs by using index-based IDs
    const cellsXML = cells.map((cell, index) => {
      const uniqueId = `cell_${index + 2}`; // Start from 2 since 0 and 1 are reserved
      if (cell.type === 'UserObject') {
        return `<UserObject id="${uniqueId}" label="${cell.label}" ${cell.props}>
          <mxCell id="${uniqueId}" vertex="${cell.vertex ? '1' : '0'}" parent="1" style="${cell.style}"/>
        </UserObject>`;
      } else {
        return `<mxCell id="${uniqueId}" vertex="${cell.vertex ? '1' : '0'}" parent="1" style="${cell.style}" value="${cell.label}"/>`;
      }
    }).join('\n');

    const mxGraphModel = `<mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cellsXML}
      </root>
    </mxGraphModel>`;

    switch (format) {
      case 'mxGraphModel':
        return mxGraphModel;
      case 'mxfile':
        return `<mxfile><diagram>${mxGraphModel}</diagram></mxfile>`;
      case 'diagram':
        return `<diagram>${mxGraphModel}</diagram>`;
      default:
        return mxGraphModel;
    }
  });
}

/**
 * Generator for valid draw.io cells
 */
function generateValidCell() {
  return fc.record({
    type: fc.constantFrom('mxCell', 'UserObject'),
    vertex: fc.boolean(),
    style: fc.oneof(
      fc.constant(''),
      fc.constant('vpc'),
      fc.constant('subnet'),
      fc.constant('mxgraph.aws4.group_vpc'),
      fc.constant('mxgraph.aws4.subnet')
    ),
    label: fc.oneof(
      fc.constant(''),
      fc.constant('VPC'),
      fc.constant('Subnet'),
      fc.constant('10.0.0.0/16'),
      fc.constant('10.0.1.0/24')
    ),
    props: fc.oneof(
      fc.constant(''),
      fc.constant('type="vpc"'),
      fc.constant('type="subnet" cidr="10.0.0.0/16"')
    )
  });
}

/**
 * Generator for invalid XML content
 */
function generateInvalidXML() {
  return fc.oneof(
    // Empty or whitespace only
    fc.constant(''),
    fc.constant('   '),
    fc.constant('\n\t  \n'),
    
    // Non-XML content
    fc.constant('This is not XML at all'),
    fc.constant('{ "json": "object" }'),
    fc.constant('plain text without any XML structure'),
    fc.constant('12345'),
    fc.constant('true'),
    
    // Malformed XML with invalid structure
    fc.constant('<>'),
    fc.constant('><'),
    fc.constant('<<>>'),
    fc.constant('<tag><nested></tag>'), // mismatched tags
    
    // Malformed XML - unclosed tags that cause parsing errors
    fc.constant('<mxGraphModel><root><mxCell id="1"'),
    fc.constant('<mxfile><diagram>content'),
    
    // XML without required draw.io structure (these should be rejected by our parser)
    fc.constant('<root><item>content</item></root>'),
    fc.constant('<html><body>Not a draw.io file</body></html>'),
    fc.constant('<config><setting>value</setting></config>'),
    fc.constant('<xml><data>some data</data></xml>'),
    fc.constant('<tag>content</tag>')
  );
}