# Implementation Plan: tfvars-generator

## Overview

Extend the `drawio-terraform-parser` CLI pipeline with a `TFVarsGenerator` module that maps the intermediate `JSON_Config` object to a `terraform.tfvars` file using a `variables.tf` template. The pipeline becomes: XML parsing → AWS extraction → JSON generation → TFVars generation → `terraform.tfvars`.

## Tasks

- [x] 1. Create `TFVarsGenerationError` and core data types in `src/TFVarsGenerator.js`
  - Define `TFVarsGenerationError` class with `type`, `message`, and `context` fields
  - Supported error types: `FILE_NOT_FOUND`, `PARSE_ERROR`, `MAPPING_ERROR`, `FORMAT_ERROR`, `WRITE_ERROR`
  - Export the class as a named export
  - _Requirements: 5.1, 5.4_

- [x] 2. Implement `parseVariablesFile(filePath)` in `TFVarsGenerator`
  - [x] 2.1 Implement regex-based parser for `variable` blocks in `variables.tf`
    - Read file with `fs/promises`; throw `FILE_NOT_FOUND` if missing
    - Extract `name`, `type`, `description`, and `default` from each block
    - Throw `PARSE_ERROR` with line number on malformed blocks
    - Emit warning to `stderr` and return `[]` when zero blocks found
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 2.2 Write property test for variables.tf parsing completeness
    - **Property 7: variables.tf parsing completeness**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [x] 2.3 Write property test for variables.tf parse round-trip
    - **Property 8: variables.tf parse round-trip**
    - **Validates: Requirements 2.8**

- [x] 3. Implement `mapConfigToVariables(jsonConfig, varDefs)` in `TFVarsGenerator`
  - [x] 3.1 Implement mapping of the six canonical `JSON_Config` fields to variable definitions
    - Map `project_name`, `vpc_cidr`, `region`, `environment`, `subnets`, `route_tables`
    - Fall back to `default` from `VariableDefinition` when no mapping exists
    - Write `null` and emit warning to `stderr` when no mapping and no default
    - Write `subnets = {}` with warning when `JSON_Config.subnets` is empty/absent
    - Write `route_tables = {}` with warning when `JSON_Config.route_tables` is empty/absent
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [x] 3.2 Write property test for variable resolution
    - **Property 1: Variable resolution**
    - **Validates: Requirements 3.7, 3.8**

  - [x] 3.3 Write property test for field mapping completeness
    - **Property 2: Field mapping completeness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

- [x] 4. Implement `formatVariable(mappedVar)` in `TFVarsGenerator`
  - [x] 4.1 Implement HCL type formatting for all Terraform types
    - `string` → double-quoted value
    - `bool` / `number` → unquoted literal
    - `map(...)` / `object(...)` → `{ key = value }` block with 2-space indentation per nesting level
    - `list(...)` / `tuple(...)` → `[...]` with double-quoted string elements
    - `null` / unknown type → `null`
    - Top-level assignment format: `<identifier> = <value>`
    - Ensure balanced braces and brackets
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 4.2 Write property test for HCL type formatting
    - **Property 3: HCL type formatting**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**

  - [x] 4.3 Write property test for HCL structural validity
    - **Property 4: HCL structural validity**
    - **Validates: Requirements 4.1, 4.7**

  - [x] 4.4 Write property test for nested indentation
    - **Property 5: Nested indentation**
    - **Validates: Requirements 4.6**

  - [x] 4.5 Write property test for TFVars generation round-trip
    - **Property 6: TFVars generation round-trip**
    - **Validates: Requirements 4.8**

- [x] 5. Implement `generate(jsonConfig, varsTemplatePath)` in `TFVarsGenerator`
  - Orchestrate: `parseVariablesFile` → `mapConfigToVariables` → `formatVariable` for each variable
  - Return `GenerateResult` with `{ content, variablesWritten, warnings }`
  - _Requirements: 1.1, 2.7, 3.9, 3.10_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Write unit tests in `src/__tests__/TFVarsGenerator.test.js`
  - [x] 7.1 Write unit tests for `parseVariablesFile`
    - Parsing a `variables.tf` with string, bool, number, map, and list variables returns correct `VariableDefinition` objects
    - Parsing a block with a `default` value returns the correct parsed default
    - Missing file throws `TFVarsGenerationError` with type `FILE_NOT_FOUND`
    - Malformed block throws `TFVarsGenerationError` with type `PARSE_ERROR`
    - Zero blocks emits warning and returns `[]`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 7.2 Write unit tests for `mapConfigToVariables`
    - Known `JSON_Config` produces expected `MappedVariable` array
    - Variable with no mapping and no default produces `null` and a warning
    - Empty `subnets` produces `subnets = {}` and a warning
    - Empty `route_tables` produces `route_tables = {}` and a warning
    - _Requirements: 3.1–3.10_

  - [x] 7.3 Write unit tests for `formatVariable`
    - Each Terraform type formats correctly
    - Nested objects use 2-space indentation
    - Balanced braces and brackets
    - _Requirements: 4.1–4.7_

  - [x] 7.4 Write unit tests for `generate`
    - Full pipeline with `arqui-test.json` produces expected `.tfvars` content
    - Zero-block `variables.tf` produces empty output and a warning
    - _Requirements: 1.1, 2.7_

- [x] 8. Update `bin/cli.js` to integrate `TFVarsGenerator`
  - [x] 8.1 Add `--vars-template <path>` argument (default: `./variables.tf` in CWD)
    - Parse the new argument in `parseArguments`
    - Default to `process.cwd() + '/variables.tf'` when not provided
    - _Requirements: 1.4, 1.5_

  - [x] 8.2 Add `--output-json <path>` optional argument
    - Parse the new argument in `parseArguments`
    - When provided with `--output`: write `JSON_Config` to `--output-json` path AND generate `.tfvars` to `--output` path
    - When provided without `--output`: write only `JSON_Config` and skip `.tfvars` generation
    - Serialize `JSON_Config` as pretty-printed JSON with 2-space indentation
    - Emit error to `stderr` and exit code `1` if the file cannot be written
    - _Requirements: 1.6, 1.7, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.3 Integrate `TFVarsGenerator` as the final pipeline step after JSON generation
    - Import `TFVarsGenerator` and `TFVarsGenerationError`
    - After `jsonGeneration.generateConfiguration`, call `tfVarsGenerator.generate(jsonConfig, varsTemplatePath)`
    - Create parent directories with `mkdir -p` semantics before writing output file
    - Write `GenerateResult.content` to `--output` path
    - Catch `TFVarsGenerationError`, write to `stderr`, exit code `1`
    - Forward all `GenerateResult.warnings` to `stderr`
    - _Requirements: 1.1, 1.2, 1.3, 5.1, 5.2, 5.3, 5.4_

  - [x] 8.4 Update `printHelp` and `validateArguments` for new modes
    - Add `--vars-template` and `--output-json` to help text with descriptions
    - Update `validateArguments` to allow `--output` to be optional when `--output-json` is provided alone
    - _Requirements: 1.4, 1.5, 6.6_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use **fast-check** (already a dev dependency) with a minimum of 100 iterations each
- Unit tests and property tests live in separate files: `TFVarsGenerator.test.js` and `TFVarsGenerator.property.test.js`
