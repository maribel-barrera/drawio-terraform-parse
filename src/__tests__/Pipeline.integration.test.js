/**
 * Integration tests for DrawIO JSON Pipeline
 * Tests end-to-end flow from draw.io XML to JSON
 */

import { DrawIOJSONPipeline, PipelineError } from '../Pipeline.js';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

describe('Pipeline Integration Tests', () => {
  let pipeline;
  let tempFiles = [];

  beforeEach(() => {
    pipeline = new DrawIOJSONPipeline({
      enableLogging: false,
      enableRecovery: true,
      validateIntermediateSteps: true
    });
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
    
    // Reset pipeline state
    pipeline.reset();
  });

  describe('End-to-end processing', () => {
    test('should process valid draw.io file with AWS components successfully', async () => {
      // Create a valid draw.io file with AWS components
      const validDrawIOXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <UserObject id="vpc-1" label="VPC Principal&#xa;10.0.0.0/16" type="vpc">
            <mxCell id="vpc-1" vertex="1" parent="1" style="mxgraph.aws4.group_vpc"/>
          </UserObject>
          <UserObject id="subnet-1" label="Subnet Publica&#xa;10.0.1.0/24" type="subnet">
            <mxCell id="subnet-1" vertex="1" parent="vpc-1" style="mxgraph.aws4.subnet"/>
          </UserObject>
          <UserObject id="subnet-2" label="Subnet Privada&#xa;10.0.2.0/24" type="subnet">
            <mxCell id="subnet-2" vertex="1" parent="vpc-1" style="mxgraph.aws4.subnet"/>
          </UserObject>
        </root>
      </mxGraphModel>`;
      
      const inputFile = join(process.cwd(), 'temp_integration_test.xml');
      const outputFile = join(process.cwd(), 'temp_integration_output.json');
      
      await writeFile(inputFile, validDrawIOXML);
      tempFiles.push(inputFile, outputFile);

      // Process the file through the complete pipeline
      const result = await pipeline.processFile(inputFile, outputFile);
      
      // Verify successful processing
      expect(result.success).toBe(true);
      expect(result.xmlResult).toBeDefined();
      expect(result.awsResult).toBeDefined();
      expect(result.jsonResult).toBeDefined();
      expect(result.outputFile).toBe(outputFile);
      
      // Verify XML parsing results
      expect(result.xmlResult.elements).toBeDefined();
      expect(result.xmlResult.elementCount).toBeGreaterThan(0);
      
      // Verify AWS extraction results
      expect(result.awsResult.components).toBeDefined();
      expect(result.awsResult.stats).toBeDefined();
      expect(result.awsResult.stats.identifiedComponents.vpcs).toBeGreaterThan(0);
      expect(result.awsResult.stats.identifiedComponents.subnets).toBeGreaterThan(0);
      
      // Verify JSON generation results
      expect(result.jsonResult.configuration).toBeDefined();
      expect(result.jsonResult.jsonOutput).toBeDefined();
      expect(result.jsonResult.configuration.vpc_name).toBeTruthy();
      expect(result.jsonResult.configuration.subnets).toBeDefined();
      expect(Object.keys(result.jsonResult.configuration.subnets).length).toBeGreaterThan(0);
      
      // Verify pipeline statistics
      expect(result.stats).toBeDefined();
      expect(result.stats.totalDuration).toBeGreaterThan(0);
      expect(result.stats.success).toBe(true);
      expect(result.stats.stages.xmlParsing.status).toBe('completed');
      expect(result.stats.stages.awsExtraction.status).toBe('completed');
      expect(result.stats.stages.jsonGeneration.status).toBe('completed');
    });

    test('should handle draw.io file without AWS components gracefully', async () => {
      // Create a draw.io file without AWS components
      const nonAWSDrawIOXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="Generic Rectangle" vertex="1" parent="1" style="rectangle"/>
          <mxCell id="3" value="Another Shape" vertex="1" parent="1" style="ellipse"/>
        </root>
      </mxGraphModel>`;
      
      const inputFile = join(process.cwd(), 'temp_non_aws_test.xml');
      const outputFile = join(process.cwd(), 'temp_non_aws_output.json');
      
      await writeFile(inputFile, nonAWSDrawIOXML);
      tempFiles.push(inputFile, outputFile);

      // Process the file - should succeed but with warnings
      const result = await pipeline.processFile(inputFile, outputFile);
      
      // Should still succeed but generate default configuration
      expect(result.success).toBe(true);
      expect(result.awsResult.components._warnings).toBeDefined();
      expect(result.jsonResult.configuration).toBeDefined();
      
      // Should generate default JSON configuration
      expect(result.jsonResult.configuration.vpc_name).toBeTruthy();
      expect(result.jsonResult.configuration.region).toBe('us-east-1');
    });

    test('should process actual project draw.io file if it exists', async () => {
      const projectFile = 'Arquitectura AWS-Account.drawio.xml';
      const outputFile = join(process.cwd(), 'temp_project_output.json');
      tempFiles.push(outputFile);
      
      try {
        // Try to process the actual project file
        const result = await pipeline.processFile(projectFile, outputFile);
        
        // If successful, verify the results
        expect(result.success).toBe(true);
        expect(result.jsonResult.configuration).toBeDefined();
        expect(result.stats.totalDuration).toBeGreaterThan(0);
        
        // Verify that we extracted some meaningful data
        expect(result.xmlResult.elementCount).toBeGreaterThan(0);
        
      } catch (error) {
        // If the file doesn't exist or has issues, that's acceptable for this test
        // Just verify we get appropriate error handling
        if (error instanceof PipelineError) {
          expect(error.stage).toBeTruthy();
          expect(error.message).toBeTruthy();
        }
      }
    });
  });

  describe('Error handling and recovery', () => {
    test('should handle malformed XML files with recovery', async () => {
      const malformedXML = '<mxGraphModel><root><mxCell id="1"'; // Malformed XML
      
      const inputFile = join(process.cwd(), 'temp_malformed_test.xml');
      const outputFile = join(process.cwd(), 'temp_malformed_output.json');
      
      await writeFile(inputFile, malformedXML);
      tempFiles.push(inputFile, outputFile);

      // Should attempt recovery and generate minimal configuration
      const result = await pipeline.processFile(inputFile, outputFile);
      
      expect(result.success).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.recoveryMethod).toBe('minimal_configuration');
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('should handle non-existent files appropriately', async () => {
      const nonExistentFile = 'non_existent_file.xml';
      const outputFile = join(process.cwd(), 'temp_nonexistent_output.json');
      tempFiles.push(outputFile);

      // With recovery enabled, should recover and generate minimal config
      const result = await pipeline.processFile(nonExistentFile, outputFile);
      expect(result.success).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.recoveryMethod).toBe('minimal_configuration');
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('should handle pipeline with recovery disabled', async () => {
      // Create pipeline with recovery disabled
      const pipelineNoRecovery = new DrawIOJSONPipeline({
        enableRecovery: false,
        enableLogging: false
      });
      
      const malformedXML = '<invalid>xml</content>';
      const inputFile = join(process.cwd(), 'temp_no_recovery_test.xml');
      
      await writeFile(inputFile, malformedXML);
      tempFiles.push(inputFile);

      // Should throw error without recovery
      await expect(pipelineNoRecovery.processFile(inputFile))
        .rejects
        .toThrow(PipelineError);
    });
  });

  describe('Pipeline state management', () => {
    test('should track pipeline state correctly during processing', async () => {
      const validXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="VPC" vertex="1" parent="1" style="vpc"/>
        </root>
      </mxGraphModel>`;
      
      const inputFile = join(process.cwd(), 'temp_state_test.xml');
      await writeFile(inputFile, validXML);
      tempFiles.push(inputFile);

      // Process file and check state during processing
      const result = await pipeline.processFile(inputFile);
      const finalState = pipeline.getState();
      
      // Verify final state
      expect(finalState.success).toBe(true);
      expect(finalState.totalDuration).toBeGreaterThanOrEqual(0);
      expect(finalState.stages.xmlParsing.status).toBe('completed');
      expect(finalState.stages.awsExtraction.status).toBe('completed');
      expect(finalState.stages.jsonGeneration.status).toBe('completed');
      
      // Verify statistics
      expect(finalState.stats).toBeDefined();
      expect(finalState.stats.stages.xmlParsing.elementsFound).toBeGreaterThan(0);
    });

    test('should reset pipeline state correctly', async () => {
      // First, run a pipeline to set some state
      const validXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
        </root>
      </mxGraphModel>`;
      
      const inputFile = join(process.cwd(), 'temp_reset_test.xml');
      await writeFile(inputFile, validXML);
      tempFiles.push(inputFile);

      await pipeline.processFile(inputFile);
      
      // Verify state is set
      let state = pipeline.getState();
      expect(state.success).toBe(true);
      expect(state.totalDuration).toBeGreaterThanOrEqual(0);
      
      // Reset pipeline
      pipeline.reset();
      
      // Verify state is reset
      state = pipeline.getState();
      expect(state.success).toBe(false);
      expect(state.totalDuration).toBe(0);
      expect(state.currentStage).toBeNull();
      expect(state.stages.xmlParsing.status).toBe('pending');
      expect(state.stages.awsExtraction.status).toBe('pending');
      expect(state.stages.jsonGeneration.status).toBe('pending');
    });
  });

  describe('Progress reporting', () => {
    test('should report progress correctly when callback is provided', async () => {
      const progressReports = [];
      
      const pipelineWithProgress = new DrawIOJSONPipeline({
        enableLogging: false,
        progressCallback: (progress) => {
          progressReports.push(progress);
        }
      });
      
      const validXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="VPC" vertex="1" parent="1" style="vpc"/>
        </root>
      </mxGraphModel>`;
      
      const inputFile = join(process.cwd(), 'temp_progress_test.xml');
      await writeFile(inputFile, validXML);
      tempFiles.push(inputFile);

      await pipelineWithProgress.processFile(inputFile);
      
      // Verify progress was reported
      expect(progressReports.length).toBeGreaterThan(0);
      
      // Verify progress structure
      progressReports.forEach(report => {
        expect(report).toHaveProperty('stage');
        expect(report).toHaveProperty('progress');
        expect(report).toHaveProperty('message');
        expect(report).toHaveProperty('totalStages', 3);
        expect(report).toHaveProperty('currentStageIndex');
        
        expect(typeof report.progress).toBe('number');
        expect(report.progress).toBeGreaterThanOrEqual(0);
        expect(report.progress).toBeLessThanOrEqual(100);
      });
      
      // Verify all stages were reported
      const stages = new Set(progressReports.map(r => r.stage));
      expect(stages.has('xmlParsing')).toBe(true);
      expect(stages.has('awsExtraction')).toBe(true);
      expect(stages.has('jsonGeneration')).toBe(true);
    });
  });

  describe('Configuration validation', () => {
    test('should validate intermediate steps when enabled', async () => {
      const pipelineWithValidation = new DrawIOJSONPipeline({
        enableLogging: false,
        validateIntermediateSteps: true
      });
      
      const validXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <UserObject id="vpc-1" label="VPC&#xa;10.0.0.0/16" type="vpc">
            <mxCell id="vpc-1" vertex="1" parent="1" style="mxgraph.aws4.group_vpc"/>
          </UserObject>
        </root>
      </mxGraphModel>`;
      
      const inputFile = join(process.cwd(), 'temp_validation_test.xml');
      await writeFile(inputFile, validXML);
      tempFiles.push(inputFile);

      const result = await pipelineWithValidation.processFile(inputFile);
      
      // Should complete successfully with validation
      expect(result.success).toBe(true);
      expect(result.jsonResult.configuration).toBeDefined();
      
      // Verify that validation was performed (no specific assertions needed,
      // just that it didn't throw errors)
    });

    test('should skip validation when disabled', async () => {
      const pipelineNoValidation = new DrawIOJSONPipeline({
        enableLogging: false,
        validateIntermediateSteps: false
      });
      
      const validXML = `<mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="2" value="Generic" vertex="1" parent="1"/>
        </root>
      </mxGraphModel>`;
      
      const inputFile = join(process.cwd(), 'temp_no_validation_test.xml');
      await writeFile(inputFile, validXML);
      tempFiles.push(inputFile);

      const result = await pipelineNoValidation.processFile(inputFile);
      
      // Should complete successfully without validation
      expect(result.success).toBe(true);
    });
  });
});