# Requirements Document

## Introduction

This feature adds a `TFVarsGenerator` module as the final step in the `drawio-terraform-parser` CLI pipeline. Instead of writing a JSON file to disk, the CLI produces a `terraform.tfvars` file by mapping the `JSON_Config` object (produced by `JSONGenerator`) to the variable definitions found in a `variables.tf` template file.

The pipeline becomes:

```
XML parsing → AWS extraction → JSON generation → TFVars generation → terraform.tfvars
```

An optional mode allows the user to also output or inspect the intermediate `JSON_Config` via a CLI flag.

## Glossary

- **CLI**: The `drawio-terraform-parser` command-line interface in `bin/cli.js`
- **JSON_Config**: The intermediate JSON object produced by `JSONGenerator` representing extracted AWS components
- **TFVarsGenerator**: The new module (`src/TFVarsGenerator.js`) responsible for mapping `JSON_Config` to HCL variable assignments
- **variables.tf**: A Terraform variable definition file used as a template for output mapping
- **HCL**: HashiCorp Configuration Language — the format used in `.tfvars` files
- **VariableDefinition**: A parsed representation of a single `variable` block from `variables.tf`
- **MappedVariable**: A `VariableDefinition` with its resolved value from `JSON_Config` or its default

---

## Requirements

### Requirement 1: CLI Pipeline Integration

**User Story:** As a developer, I want the CLI to produce a `.tfvars` file from a draw.io diagram, so that I can use the output directly with Terraform without manual editing.

#### Acceptance Criteria

1. WHEN the user runs the CLI with `--input` and `--output` flags, THE CLI SHALL execute the full pipeline: XML parsing → AWS extraction → JSON generation → TFVars generation → write `.tfvars` file.
2. WHEN the pipeline completes successfully, THE CLI SHALL exit with code `0`.
3. WHEN any pipeline step fails, THE CLI SHALL exit with code `1` and write a descriptive error message to `stderr`.
4. THE CLI SHALL accept a `--vars-template <path>` argument specifying the path to the `variables.tf` template file.
5. IF `--vars-template` is not provided, THEN THE CLI SHALL default to `./variables.tf` in the current working directory.
6. THE CLI SHALL accept a `--output-json <path>` optional argument that, when provided, causes THE CLI to also write the intermediate `JSON_Config` to the specified file path in addition to generating the `.tfvars` output.
7. WHERE `--output-json` is provided without `--output`, THE CLI SHALL write only the `JSON_Config` to the specified path and skip `.tfvars` generation.

### Requirement 2: variables.tf Parsing

**User Story:** As a developer, I want the tool to parse my `variables.tf` file, so that the output `.tfvars` contains only the variables I have declared.

#### Acceptance Criteria

1. WHEN a valid `variables.tf` file is provided, THE TFVarsGenerator SHALL parse all `variable` blocks and return a `VariableDefinition` array.
2. WHEN a `variable` block contains a `type` attribute, THE TFVarsGenerator SHALL include the raw type string in the `VariableDefinition`.
3. WHEN a `variable` block contains a `description` attribute, THE TFVarsGenerator SHALL include it in the `VariableDefinition`.
4. WHEN a `variable` block contains a `default` attribute, THE TFVarsGenerator SHALL parse and include the default value in the `VariableDefinition`.
5. IF the `variables.tf` file is not found, THEN THE TFVarsGenerator SHALL throw a `TFVarsGenerationError` with type `FILE_NOT_FOUND`.
6. IF the `variables.tf` file cannot be parsed, THEN THE TFVarsGenerator SHALL throw a `TFVarsGenerationError` with type `PARSE_ERROR` including the line number.
7. WHEN a `variables.tf` file contains zero `variable` blocks, THE TFVarsGenerator SHALL emit a warning to `stderr` and produce an empty output file.
8. FOR ALL valid `variables.tf` content, parsing then formatting then re-parsing SHALL produce an equivalent set of `VariableDefinition` objects (round-trip property).

### Requirement 3: JSON_Config to Variable Mapping

**User Story:** As a developer, I want the tool to map my diagram's extracted data to the correct Terraform variables, so that the `.tfvars` file reflects the actual infrastructure defined in the diagram.

#### Acceptance Criteria

1. THE TFVarsGenerator SHALL map `JSON_Config.project_name` to the `project_name` variable.
2. THE TFVarsGenerator SHALL map `JSON_Config.vpc_cidr` to the `vpc_cidr` variable.
3. THE TFVarsGenerator SHALL map `JSON_Config.region` to the `region` variable.
4. THE TFVarsGenerator SHALL map `JSON_Config.environment` to the `environment` variable.
5. THE TFVarsGenerator SHALL map `JSON_Config.subnets` to the `subnets` variable, preserving nested object structure.
6. THE TFVarsGenerator SHALL map `JSON_Config.route_tables` to the `route_tables` variable, preserving nested object structure.
7. WHEN a variable in `variables.tf` has no corresponding `JSON_Config` field, THE TFVarsGenerator SHALL use the `default` value from `variables.tf` if one is defined.
8. WHEN a variable has no `JSON_Config` mapping and no `default`, THE TFVarsGenerator SHALL write `null` for that variable and emit a warning to `stderr`.
9. WHEN `JSON_Config.subnets` is empty or absent, THE TFVarsGenerator SHALL write `subnets = {}` and emit a warning to `stderr`.
10. WHEN `JSON_Config.route_tables` is empty or absent, THE TFVarsGenerator SHALL write `route_tables = {}` and emit a warning to `stderr`.

### Requirement 4: HCL Output Formatting

**User Story:** As a developer, I want the generated `.tfvars` file to be valid HCL, so that Terraform can consume it without errors.

#### Acceptance Criteria

1. THE TFVarsGenerator SHALL format every top-level assignment as `<identifier> = <value>`.
2. THE TFVarsGenerator SHALL format `string` type values as double-quoted strings.
3. THE TFVarsGenerator SHALL format `bool` and `number` type values as unquoted literals.
4. THE TFVarsGenerator SHALL format `map(...)` and `object(...)` type values using `{ key = value }` block syntax.
5. THE TFVarsGenerator SHALL format `list(...)` and `tuple(...)` type values using `[...]` syntax with double-quoted string elements.
6. THE TFVarsGenerator SHALL indent nested object key-value pairs by exactly 2 spaces per nesting level relative to the parent block.
7. THE TFVarsGenerator SHALL produce output with balanced braces and brackets for all generated content.
8. FOR ALL valid `JSON_Config` objects, generating a `.tfvars` string and re-parsing the assignments SHALL produce values equivalent to the original mapped values (round-trip property).

### Requirement 5: Error Handling and Warnings

**User Story:** As a developer, I want clear error messages and warnings, so that I can diagnose and fix issues without inspecting intermediate files.

#### Acceptance Criteria

1. WHEN a `TFVarsGenerationError` is thrown, THE CLI SHALL write the error message to `stderr` and exit with code `1`.
2. THE CLI SHALL write all warnings to `stderr` so they do not pollute the `.tfvars` output when stdout is redirected.
3. WHEN the output directory does not exist, THE CLI SHALL create all necessary parent directories before writing the output file.
4. IF the output file cannot be written, THEN THE CLI SHALL throw a `TFVarsGenerationError` with type `WRITE_ERROR` and not write a partial file.

### Requirement 6: Optional JSON Output Mode

**User Story:** As a developer, I want the option to output the intermediate `JSON_Config` from the CLI, so that I can inspect or debug the extracted data without modifying the pipeline.

#### Acceptance Criteria

1. THE CLI SHALL accept an optional `--output-json <path>` flag.
2. WHEN `--output-json` is provided alongside `--output`, THE CLI SHALL write the `JSON_Config` to the specified path AND generate the `.tfvars` file at the `--output` path.
3. WHEN `--output-json` is provided without `--output`, THE CLI SHALL write only the `JSON_Config` to the specified path and skip `.tfvars` generation.
4. WHEN `--output-json` is provided, THE CLI SHALL serialize the `JSON_Config` as pretty-printed JSON with 2-space indentation.
5. IF the `--output-json` file cannot be written, THEN THE CLI SHALL emit an error to `stderr` and exit with code `1`.
6. THE CLI SHALL display the `--output-json` option in the help text with a description of its purpose.
