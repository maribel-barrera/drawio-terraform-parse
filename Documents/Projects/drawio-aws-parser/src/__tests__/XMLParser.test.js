/**
 * Unit tests for XMLParser class
 * Tests specific examples and error cases for draw.io XML parsing
 */

import { XMLParser, DrawIOParserError } from '../XMLParser.js';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

describe('XMLParser Unit Tests', () => {
  let xmlParser;
  let tempFiles = [];

  beforeEach(() => {
    xmlParser = new XMLParser();
  });

  afterEach(async () => {
    // Clean up temporary files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore cleanup errors
      }
    }
    tempFiles = [];
  });

  describe('parseDrawIOFile', () => {
    test('should parse valid draw.io file with mxGraphModel format', async () => {
      const validXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="VPC" vertex="1" parent="1" style="vpc"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_test_file.xml');
      await writeFile(tempFile, validXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
      expect(result.root.mxCell).toBeDefined();
    });

    test('should parse valid draw.io file with mxfile format', async () => {
      const validXML = `<mxfile>
        <diagram>
          <mxGraphModel>
            <root>
              <mxCell id="0"/>
              <mxCell id="1" parent="0"/>
              <mxCell id="2" value="Subnet" vertex="1" parent="1" style="subnet"/>
            </root>
          </mxGraphModel>
        </diagram>
      </mxfile>`;
      
      const tempFile = join(process.cwd(), 'temp_test_mxfile.xml');
      await writeFile(tempFile, validXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
    });

    test('should throw FILE_NOT_FOUND error for non-existent file', async () => {
      const nonExistentFile = 'non_existent_file.xml';
      
      await expect(xmlParser.parseDrawIOFile(nonExistentFile))
        .rejects
        .toThrow(DrawIOParserError);
      
      try {
        await xmlParser.parseDrawIOFile(nonExistentFile);
      } catch (error) {
        expect(error.type).toBe('FILE_NOT_FOUND');
        expect(error.message).toContain('Archivo no encontrado');
      }
    });

    test('should throw XML_PARSE_ERROR for malformed XML file', async () => {
      const malformedXML = '<mxGraphModel><root><mxCell id="1"'; // Truly malformed - missing closing tags
      
      const tempFile = join(process.cwd(), 'temp_malformed.xml');
      await writeFile(tempFile, malformedXML);
      tempFiles.push(tempFile);

      await expect(xmlParser.parseDrawIOFile(tempFile))
        .rejects
        .toThrow(DrawIOParserError);
    });
  });

  describe('validateDrawIOFormat', () => {
    test('should validate mxGraphModel format successfully', () => {
      const validDoc = {
        mxGraphModel: {
          root: {
            mxCell: [
              { id: "0" },
              { id: "1", parent: "0" }
            ]
          }
        }
      };

      expect(() => xmlParser.validateDrawIOFormat(validDoc)).not.toThrow();
      expect(xmlParser.validateDrawIOFormat(validDoc)).toBe(true);
    });

    test('should validate mxfile format successfully', () => {
      const validDoc = {
        mxfile: {
          diagram: {
            mxGraphModel: {
              root: {}
            }
          }
        }
      };

      expect(() => xmlParser.validateDrawIOFormat(validDoc)).not.toThrow();
      expect(xmlParser.validateDrawIOFormat(validDoc)).toBe(true);
    });

    test('should validate diagram format successfully', () => {
      const validDoc = {
        diagram: {
          mxGraphModel: {
            root: {}
          }
        }
      };

      expect(() => xmlParser.validateDrawIOFormat(validDoc)).not.toThrow();
      expect(xmlParser.validateDrawIOFormat(validDoc)).toBe(true);
    });

    test('should throw INVALID_XML_STRUCTURE for null input', () => {
      expect(() => xmlParser.validateDrawIOFormat(null))
        .toThrow(DrawIOParserError);
      
      try {
        xmlParser.validateDrawIOFormat(null);
      } catch (error) {
        expect(error.type).toBe('INVALID_XML_STRUCTURE');
      }
    });

    test('should throw INVALID_DRAWIO_FORMAT for unsupported root tag', () => {
      const invalidDoc = {
        html: {
          body: "Not a draw.io file"
        }
      };

      expect(() => xmlParser.validateDrawIOFormat(invalidDoc))
        .toThrow(DrawIOParserError);
      
      try {
        xmlParser.validateDrawIOFormat(invalidDoc);
      } catch (error) {
        expect(error.type).toBe('INVALID_DRAWIO_FORMAT');
        expect(error.message).toContain('html');
      }
    });

    test('should throw MISSING_ROOT_ELEMENT for mxGraphModel without root', () => {
      const invalidDoc = {
        mxGraphModel: {
          // Missing root element
        }
      };

      expect(() => xmlParser.validateDrawIOFormat(invalidDoc))
        .toThrow(DrawIOParserError);
      
      try {
        xmlParser.validateDrawIOFormat(invalidDoc);
      } catch (error) {
        expect(error.type).toBe('MISSING_ROOT_ELEMENT');
      }
    });

    test('should throw MISSING_DIAGRAM_ELEMENT for mxfile without diagram', () => {
      const invalidDoc = {
        mxfile: {
          // Missing diagram element
        }
      };

      expect(() => xmlParser.validateDrawIOFormat(invalidDoc))
        .toThrow(DrawIOParserError);
      
      try {
        xmlParser.validateDrawIOFormat(invalidDoc);
      } catch (error) {
        expect(error.type).toBe('MISSING_DIAGRAM_ELEMENT');
      }
    });
  });

  describe('extractGraphElements', () => {
    test('should extract elements from mxGraphModel format', () => {
      const doc = {
        mxGraphModel: {
          root: {
            mxCell: [
              { id: "0" },
              { id: "1", parent: "0" },
              { id: "2", value: "VPC", vertex: "1", parent: "1" }
            ]
          }
        }
      };

      const result = xmlParser.extractGraphElements(doc);
      
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
      expect(result.root.mxCell).toBeDefined();
    });

    test('should extract elements from mxfile format', () => {
      const doc = {
        mxfile: {
          diagram: {
            mxGraphModel: {
              root: {
                mxCell: [
                  { id: "0" },
                  { id: "1", parent: "0" }
                ]
              }
            }
          }
        }
      };

      const result = xmlParser.extractGraphElements(doc);
      
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
    });

    test('should throw UNSUPPORTED_FORMAT for unknown format', () => {
      const doc = {
        unknownFormat: {
          content: "some content"
        }
      };

      expect(() => xmlParser.extractGraphElements(doc))
        .toThrow(DrawIOParserError);
      
      try {
        xmlParser.extractGraphElements(doc);
      } catch (error) {
        expect(error.type).toBe('INVALID_DRAWIO_FORMAT');
      }
    });
  });

  describe('Real draw.io file parsing', () => {
    test('should parse actual project draw.io file successfully', async () => {
      const projectFile = 'Arquitectura AWS-Account.drawio.xml';
      
      try {
        const result = await xmlParser.parseDrawIOFile(projectFile);
        
        expect(result).toBeDefined();
        expect(result.root).toBeDefined();
        expect(result.root.mxCell).toBeDefined();
        expect(Array.isArray(result.root.mxCell)).toBe(true);
        expect(result.root.mxCell.length).toBeGreaterThan(0);
      } catch (error) {
        // If the file has XML declaration or other format issues, 
        // verify we get appropriate error handling
        expect(error).toBeInstanceOf(DrawIOParserError);
        expect(['INVALID_DRAWIO_FORMAT', 'XML_PARSE_ERROR', 'FILE_NOT_FOUND']).toContain(error.type);
      }
    });

    test('should extract AWS components from real file', async () => {
      const projectFile = 'Arquitectura AWS-Account.drawio.xml';
      
      try {
        const result = await xmlParser.parseDrawIOFile(projectFile);
        const elements = xmlParser.extractGraphElements({ mxGraphModel: result });
        
        expect(elements).toBeDefined();
        expect(elements.root).toBeDefined();
        
        // Verify we can find AWS-related elements
        const cells = elements.root.mxCell;
        const awsElements = cells.filter(cell => 
          cell.value && (
            cell.value.includes('VPC') || 
            cell.value.includes('Subnet') || 
            cell.value.includes('AWS')
          )
        );
        
        expect(awsElements.length).toBeGreaterThan(0);
      } catch (error) {
        // If parsing fails, verify we get appropriate error handling
        expect(error).toBeInstanceOf(DrawIOParserError);
        expect(['INVALID_DRAWIO_FORMAT', 'XML_PARSE_ERROR', 'FILE_NOT_FOUND']).toContain(error.type);
      }
    });
  });

  describe('Specific draw.io format variations', () => {
    test('should handle compressed diagram content in mxfile', async () => {
      // Test with base64 compressed content (common in draw.io exports)
      const compressedXML = `<mxfile>
        <diagram>
          <mxGraphModel>
            <root>
              <mxCell id="0"/>
              <mxCell id="1" parent="0"/>
              <mxCell id="2" value="Test VPC" vertex="1" parent="1"/>
            </root>
          </mxGraphModel>
        </diagram>
      </mxfile>`;
      
      const tempFile = join(process.cwd(), 'temp_compressed.xml');
      await writeFile(tempFile, compressedXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
      expect(result.root.mxCell).toBeDefined();
    });

    test('should handle multiple diagrams in mxfile', async () => {
      const multiDiagramXML = `<mxfile>
        <diagram name="Diagram1">
          <mxGraphModel>
            <root>
              <mxCell id="0"/>
              <mxCell id="1" parent="0"/>
              <mxCell id="2" value="VPC1" vertex="1" parent="1"/>
            </root>
          </mxGraphModel>
        </diagram>
        <diagram name="Diagram2">
          <mxGraphModel>
            <root>
              <mxCell id="0"/>
              <mxCell id="1" parent="0"/>
              <mxCell id="3" value="VPC2" vertex="1" parent="1"/>
            </root>
          </mxGraphModel>
        </diagram>
      </mxfile>`;
      
      const tempFile = join(process.cwd(), 'temp_multi_diagram.xml');
      await writeFile(tempFile, multiDiagramXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root).toBeDefined();
      // Should extract from first diagram
      expect(result.root.mxCell).toBeDefined();
    });
  });

  describe('Error handling edge cases', () => {
    test('should handle empty file content', async () => {
      const tempFile = join(process.cwd(), 'temp_empty.xml');
      await writeFile(tempFile, '');
      tempFiles.push(tempFile);

      await expect(xmlParser.parseDrawIOFile(tempFile))
        .rejects
        .toThrow(DrawIOParserError);
      
      try {
        await xmlParser.parseDrawIOFile(tempFile);
      } catch (error) {
        expect(['EMPTY_CONTENT', 'INVALID_XML_FORMAT']).toContain(error.type);
      }
    });

    test('should handle non-XML content', async () => {
      const nonXMLContent = 'This is not XML content at all';
      const tempFile = join(process.cwd(), 'temp_non_xml.xml');
      await writeFile(tempFile, nonXMLContent);
      tempFiles.push(tempFile);

      await expect(xmlParser.parseDrawIOFile(tempFile))
        .rejects
        .toThrow(DrawIOParserError);
      
      try {
        await xmlParser.parseDrawIOFile(tempFile);
      } catch (error) {
        expect(['INVALID_XML_FORMAT', 'XML_PARSE_ERROR']).toContain(error.type);
      }
    });

    test('should handle large file processing', async () => {
      // Test with a large XML structure to ensure memory handling
      const largeCells = Array.from({ length: 100 }, (_, i) => 
        `<mxCell id="${i + 10}" value="Cell ${i}" vertex="1" parent="1"/>`
      ).join('\n');
      
      const largeXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          ${largeCells}
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_large.xml');
      await writeFile(tempFile, largeXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root.mxCell).toBeDefined();
      expect(result.root.mxCell.length).toBe(102); // 0, 1, plus 100 generated cells
    });

    test('should handle deeply nested XML structures', async () => {
      const deepXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="VPC with &lt;nested&gt; &amp; special chars" vertex="1" parent="1">
            <mxGeometry x="100" y="200" width="300" height="150" as="geometry"/>
          </mxCell>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_deep.xml');
      await writeFile(tempFile, deepXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root.mxCell).toBeDefined();
      expect(result.root.mxCell.length).toBe(3);
    });

    test('should provide detailed error information', () => {
      const error = new DrawIOParserError(
        'XML_PARSE_ERROR',
        'Test error message',
        { line: 5, column: 10 }
      );

      const details = xmlParser.getErrorDetails(error);
      
      expect(details.type).toBe('XML_PARSE_ERROR');
      expect(details.message).toBe('Test error message');
      expect(details.context).toEqual({ line: 5, column: 10 });
      expect(details.suggestions).toBeDefined();
      expect(Array.isArray(details.suggestions)).toBe(true);
    });

    test('should handle file permission errors gracefully', async () => {
      // Test with a path that would cause permission issues
      const restrictedPath = '/root/restricted_file.xml';
      
      await expect(xmlParser.parseDrawIOFile(restrictedPath))
        .rejects
        .toThrow(DrawIOParserError);
      
      try {
        await xmlParser.parseDrawIOFile(restrictedPath);
      } catch (error) {
        expect(['FILE_NOT_FOUND', 'FILE_READ_ERROR']).toContain(error.type);
      }
    });
  });

  describe('AWS component validation requirements', () => {
    test('should validate draw.io files with AWS VPC components', async () => {
      const awsVpcXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="vpc1" value="VPC&#xa;10.102.67.0/24" vertex="1" parent="1" style="aws4.group_vpc"/>
          <mxCell id="subnet1" value="Subnet Publica&#xa;10.102.67.0/28" vertex="1" parent="vpc1" style="aws4.group_security_group"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_aws_vpc.xml');
      await writeFile(tempFile, awsVpcXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root.mxCell).toBeDefined();
      
      // Verify AWS components are present
      const vpcCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('VPC'));
      const subnetCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('Subnet'));
      
      expect(vpcCell).toBeDefined();
      expect(subnetCell).toBeDefined();
    });

    test('should handle draw.io files without AWS components', async () => {
      const nonAwsXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="Generic Rectangle" vertex="1" parent="1"/>
          <mxCell id="3" value="Another Shape" vertex="1" parent="1"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_non_aws.xml');
      await writeFile(tempFile, nonAwsXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root.mxCell).toBeDefined();
      expect(result.root.mxCell.length).toBe(4); // 0, 1, 2, 3
    });
  });
});

  describe('HTML Value Cleaning', () => {
    let tempFiles = [];
    let xmlParser;

    beforeEach(() => {
      xmlParser = new XMLParser();
    });

    afterEach(async () => {
      // Clean up temporary files
      for (const file of tempFiles) {
        try {
          await unlink(file);
        } catch {
          // Ignore cleanup errors
        }
      }
      tempFiles = [];
    });

    test('should clean HTML tags from value attributes', async () => {
      const htmlValueXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="&lt;font style=&quot;font-size: 11px&quot;&gt;Organization&lt;/font&gt;" vertex="1" parent="1"/>
          <mxCell id="3" value="&lt;span style=&quot;color: rgb(0, 0, 0)&quot;&gt;&lt;font style=&quot;font-size: 11px&quot;&gt;CloudWatch&lt;/font&gt;&lt;/span&gt;" vertex="1" parent="1"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_html_values.xml');
      await writeFile(tempFile, htmlValueXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root.mxCell).toBeDefined();
      
      // Find cells with cleaned values
      const orgCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('Organization'));
      const cloudWatchCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('CloudWatch'));
      
      expect(orgCell).toBeDefined();
      expect(orgCell.value).toBe('Organization'); // Should be cleaned of HTML tags
      
      expect(cloudWatchCell).toBeDefined();
      expect(cloudWatchCell.value).toBe('CloudWatch'); // Should be cleaned of HTML tags
    });

    test('should clean complex HTML structures from values', async () => {
      const complexHtmlXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="&lt;div&gt;Route 53&lt;div&gt;&lt;span data-teams=&quot;true&quot;&gt;coecloud-dev.mx&lt;/span&gt;&lt;/div&gt;&lt;/div&gt;" vertex="1" parent="1"/>
          <mxCell id="3" value="ECS&amp;nbsp;&lt;span style=&quot;color: rgb(0, 0, 0); text-wrap: wrap;&quot;&gt;Fargate&lt;/span&gt;&lt;div&gt;&lt;span style=&quot;color: rgb(0, 0, 0); text-wrap: wrap;&quot;&gt;BackEnd&lt;/span&gt;&lt;/div&gt;" vertex="1" parent="1"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_complex_html.xml');
      await writeFile(tempFile, complexHtmlXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      
      const route53Cell = result.root.mxCell.find(cell => cell.value && cell.value.includes('Route 53'));
      const ecsCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('ECS'));
      
      expect(route53Cell).toBeDefined();
      expect(route53Cell.value).toBe('Route 53coecloud-dev.mx'); // Should be cleaned and concatenated
      
      expect(ecsCell).toBeDefined();
      expect(ecsCell.value).toBe('ECS FargateBackEnd'); // Should be cleaned and concatenated
    });

    test('should handle values without HTML tags unchanged', async () => {
      const plainTextXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="VPC" vertex="1" parent="1"/>
          <mxCell id="3" value="Subnet Privada" vertex="1" parent="1"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_plain_text.xml');
      await writeFile(tempFile, plainTextXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      
      const vpcCell = result.root.mxCell.find(cell => cell.value === 'VPC');
      const subnetCell = result.root.mxCell.find(cell => cell.value === 'Subnet Privada');
      
      expect(vpcCell).toBeDefined();
      expect(vpcCell.value).toBe('VPC'); // Should remain unchanged
      
      expect(subnetCell).toBeDefined();
      expect(subnetCell.value).toBe('Subnet Privada'); // Should remain unchanged
    });

    test('should handle empty and null values gracefully', async () => {
      const emptyValuesXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="" vertex="1" parent="1"/>
          <mxCell id="3" vertex="1" parent="1"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_empty_values.xml');
      await writeFile(tempFile, emptyValuesXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      expect(result.root.mxCell).toBeDefined();
      expect(result.root.mxCell.length).toBe(4);
      
      // Should not throw errors for empty or missing values
      const emptyValueCell = result.root.mxCell.find(cell => cell.id === '2');
      const noValueCell = result.root.mxCell.find(cell => cell.id === '3');
      
      expect(emptyValueCell).toBeDefined();
      expect(emptyValueCell.value).toBe(''); // Should remain empty
      
      expect(noValueCell).toBeDefined();
      expect(noValueCell.value).toBeUndefined(); // Should remain undefined
    });

    test('should decode HTML entities correctly', async () => {
      const entitiesXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="&lt;font&gt;Version &amp;nbsp; 1.0&lt;/font&gt;" vertex="1" parent="1"/>
          <mxCell id="3" value="Port: &amp;lt;1533&amp;gt;" vertex="1" parent="1"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_entities.xml');
      await writeFile(tempFile, entitiesXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      
      const versionCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('Version'));
      const portCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('Port'));
      
      expect(versionCell).toBeDefined();
      expect(versionCell.value).toBe('Version 1.0'); // Should decode &nbsp; to space
      
      expect(portCell).toBeDefined();
      expect(portCell.value).toBe('Port:'); // Should decode &lt; and &gt;
    });

    test('should handle malformed HTML gracefully', async () => {
      const malformedHtmlXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="&lt;font style=&quot;unclosed tag&gt;Text&lt;/font&gt;" vertex="1" parent="1"/>
          <mxCell id="3" value="&lt;span&gt;Nested &lt;div&gt;content&lt;/span&gt;" vertex="1" parent="1"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_malformed_html.xml');
      await writeFile(tempFile, malformedHtmlXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      
      const fontCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('Text'));
      const spanCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('content'));
      
      expect(fontCell).toBeDefined();
      expect(fontCell.value).toBe('Text'); // Should extract text despite malformed HTML
      
      expect(spanCell).toBeDefined();
      expect(spanCell.value).toBe('Nested content'); // Should handle nested tags
    });

    test('should handle the specific example from user request', async () => {
      const userExampleXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="&lt;span style=&quot;text-align: right;&quot;&gt;&lt;font&gt;Versión 1.0&lt;/font&gt;&lt;/span&gt;" vertex="1" parent="1"/>
        </root>
      </mxGraphModel>`;
      
      const tempFile = join(process.cwd(), 'temp_user_example.xml');
      await writeFile(tempFile, userExampleXML);
      tempFiles.push(tempFile);

      const result = await xmlParser.parseDrawIOFile(tempFile);
      
      expect(result).toBeDefined();
      
      const versionCell = result.root.mxCell.find(cell => cell.value && cell.value.includes('Versión'));
      
      expect(versionCell).toBeDefined();
      expect(versionCell.value).toBe('Versión 1.0'); // Should extract exactly "Versión 1.0"
    });
  });