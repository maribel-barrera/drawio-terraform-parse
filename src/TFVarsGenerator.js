// src/TFVarsGenerator.js
import { readFile } from 'fs/promises';

/**
 * Custom error class for TFVars generation errors.
 *
 * Supported error types:
 *   - 'FILE_NOT_FOUND'  : variables.tf file could not be found
 *   - 'PARSE_ERROR'     : variables.tf file could not be parsed
 *   - 'MAPPING_ERROR'   : a variable could not be mapped from JSON_Config
 *   - 'FORMAT_ERROR'    : a value could not be formatted as HCL
 *   - 'WRITE_ERROR'     : the output file could not be written
 */
export class TFVarsGenerationError extends Error {
  /**
   * @param {'FILE_NOT_FOUND'|'PARSE_ERROR'|'MAPPING_ERROR'|'FORMAT_ERROR'|'WRITE_ERROR'} type
   * @param {string} message
   * @param {object} [context]
   */
  constructor(type, message, context = {}) {
    super(message);
    this.name = 'TFVarsGenerationError';
    this.type = type;
    this.context = context;
  }
}

/**
 * @typedef {Object} VariableDefinition
 * A variable block parsed from variables.tf
 * @property {string}      name        - e.g. "vpc_cidr"
 * @property {string|null} type        - e.g. "string", "map(object({...}))", "list(string)"
 * @property {string|null} description
 * @property {*}           [default]   - parsed default value, or undefined if absent
 */

/**
 * @typedef {Object} MappedVariable
 * A variable with its resolved value
 * @property {string}                        name
 * @property {string|null}                   type
 * @property {*}                             value    - resolved from JSON_Config or default
 * @property {'json_config'|'default'|'null'} source
 * @property {string}                        [warning] - set when source === 'null'
 */

/**
 * @typedef {Object} GenerateResult
 * Return value of generate()
 * @property {string}   content           - full .tfvars file content
 * @property {number}   variablesWritten
 * @property {string[]} warnings
 */

/**
 * Extract the raw value of a named attribute from an HCL block body text.
 * Handles multi-line values by tracking parenthesis/brace/bracket depth.
 * Skips `validation { ... }` sub-blocks.
 *
 * @param {string} blockText - text inside the variable block (without outer braces)
 * @param {string} attrName  - attribute name to find (e.g. 'type', 'default')
 * @returns {string|null}    - raw value string, or null if not found
 */
function extractAttributeValue(blockText, attrName) {
  const lines = blockText.split('\n').map(l => l.replace(/\r$/, ''));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip validation blocks
    if (/^\s*validation\s*\{/.test(line)) {
      let depth = 0;
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      i++;
      while (i < lines.length && depth > 0) {
        for (const ch of lines[i]) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
        i++;
      }
      continue;
    }

    // Match `attrName = <value start>`
    const attrRegex = new RegExp(`^\\s*${attrName}\\s*=\\s*(.*)$`);
    const match = line.match(attrRegex);
    if (match) {
      let value = match[1].trim();
      // Remove inline comments
      // Count open parens/braces/brackets to see if value continues on next lines
      let parenDepth = 0;
      let braceDepth = 0;
      let bracketDepth = 0;
      let inString = false;
      for (const ch of value) {
        if (ch === '"' && !inString) inString = true;
        else if (ch === '"' && inString) inString = false;
        if (!inString) {
          if (ch === '(') parenDepth++;
          else if (ch === ')') parenDepth--;
          else if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
          else if (ch === '[') bracketDepth++;
          else if (ch === ']') bracketDepth--;
        }
      }
      i++;
      // Continue collecting lines while any depth is open
      while (i < lines.length && (parenDepth > 0 || braceDepth > 0 || bracketDepth > 0)) {
        const nextLine = lines[i];
        value += '\n' + nextLine;
        for (const ch of nextLine) {
          if (ch === '"' && !inString) inString = true;
          else if (ch === '"' && inString) inString = false;
          if (!inString) {
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth--;
            else if (ch === '{') braceDepth++;
            else if (ch === '}') braceDepth--;
            else if (ch === '[') bracketDepth++;
            else if (ch === ']') bracketDepth--;
          }
        }
        i++;
      }
      return value;
    }
    i++;
  }
  return null;
}

/**
 * Parse a raw HCL default value string into a JS value.
 *
 * @param {string} raw
 * @returns {*}
 */
function parseDefaultValue(raw) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // Quoted string
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  // Empty object / map
  if (raw === '{}') return {};
  // Multi-line object — best-effort: return empty object
  if (raw.startsWith('{')) return {};
  // List / tuple
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    // Simple comma-split for flat lists
    try {
      return inner.split(',').map(s => {
        const t = s.trim();
        if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
        if (t === 'null') return null;
        if (t === 'true') return true;
        if (t === 'false') return false;
        if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
        return t;
      });
    } catch {
      return raw;
    }
  }
  // Fallback: return raw string
  return raw;
}

/**
 * Determine if a Terraform type string is a map/object type.
 * @param {string|null} type
 * @returns {boolean}
 */
function isMapType(type) {
  if (!type) return false;
  const t = type.trim().toLowerCase();
  return t === 'map' || t.startsWith('map(') || t.startsWith('object(');
}

/**
 * Determine if a Terraform type string is a list/tuple type.
 * @param {string|null} type
 * @returns {boolean}
 */
function isListType(type) {
  if (!type) return false;
  const t = type.trim().toLowerCase();
  return t === 'list' || t.startsWith('list(') || t.startsWith('tuple(') || t === 'set' || t.startsWith('set(');
}

/**
 * Format a JS value as an HCL value string, respecting the declared Terraform type.
 *
 * @param {*}           value   - The JS value to format
 * @param {string|null} type    - The Terraform type string (e.g. "string", "map(string)")
 * @param {number}      depth   - Current nesting depth (0 = top-level)
 * @returns {string}
 */
function formatHCLValue(value, type, depth) {
  // null / undefined → always "null"
  if (value === null || value === undefined) {
    return 'null';
  }

  const indent = '  '.repeat(depth + 1);
  const closingIndent = '  '.repeat(depth);

  // map / object type
  if (isMapType(type)) {
    if (typeof value !== 'object' || Array.isArray(value)) {
      return 'null';
    }
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '{}';
    }
    const lines = entries.map(([k, v]) => {
      // Infer inner type: if value is an object → object, if array → list, else null (let value guide)
      let innerType = null;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) innerType = 'object(...)';
      else if (Array.isArray(v)) innerType = 'list(string)';
      // Quote keys that are not valid HCL identifiers
      const safeKey = /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(k)
        ? k
        : `"${k.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      return `${indent}${safeKey} = ${formatHCLValue(v, innerType, depth + 1)}`;
    });
    return `{\n${lines.join('\n')}\n${closingIndent}}`;
  }

  // list / tuple type
  if (isListType(type)) {
    if (!Array.isArray(value)) {
      return 'null';
    }
    if (value.length === 0) {
      return '[]';
    }
    const items = value.map(item => {
      if (item === null || item === undefined) return 'null';
      if (typeof item === 'boolean') return String(item);
      if (typeof item === 'number') return String(item);
      // Default: quote as string
      return `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    });
    return `[${items.join(', ')}]`;
  }

  // bool type
  if (type === 'bool') {
    if (typeof value === 'boolean') return String(value);
    if (value === 'true' || value === 'false') return value;
    return 'null';
  }

  // number type
  if (type === 'number') {
    if (typeof value === 'number') return String(value);
    const n = Number(value);
    if (!isNaN(n)) return String(n);
    return 'null';
  }

  // string type (explicit or inferred)
  if (type === 'string' || typeof value === 'string') {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  // No declared type — infer from JS value
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(item => {
      if (item === null || item === undefined) return 'null';
      if (typeof item === 'boolean') return String(item);
      if (typeof item === 'number') return String(item);
      return `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    });
    return `[${items.join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([k, v]) => {
      let innerType = null;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) innerType = 'object(...)';
      else if (Array.isArray(v)) innerType = 'list(string)';
      // Quote keys that are not valid HCL identifiers
      const safeKey = /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(k)
        ? k
        : `"${k.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      return `${indent}${safeKey} = ${formatHCLValue(v, innerType, depth + 1)}`;
    });
    return `{\n${lines.join('\n')}\n${closingIndent}}`;
  }

  // Fallback
  return 'null';
}


export class TFVarsGenerator {
  /**
   * Parse a variables.tf file and return an array of VariableDefinition objects.
   *
   * @param {string} filePath - Path to the variables.tf file
   * @returns {Promise<VariableDefinition[]>}
   * @throws {TFVarsGenerationError} FILE_NOT_FOUND if the file does not exist
   * @throws {TFVarsGenerationError} PARSE_ERROR if the file cannot be parsed
   */
  async parseVariablesFile(filePath) {
    let content;
    try {
      content = await readFile(filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new TFVarsGenerationError('FILE_NOT_FOUND', `File not found: ${filePath}`, { filePath });
      }
      throw new TFVarsGenerationError('FILE_NOT_FOUND', `Cannot read file: ${filePath}: ${err.message}`, { filePath });
    }

    const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
    const variables = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      // Match variable "name" { — possibly with trailing whitespace
      const varMatch = line.match(/^variable\s+"([^"]+)"\s*\{/);
      if (varMatch) {
        const blockStartLine = i + 1; // 1-indexed for error reporting
        const name = varMatch[1];

        // Collect the full block by tracking brace depth.
        // Skip characters inside double-quoted strings so that a `{` or `}`
        // inside a string value does not affect the depth counter.
        let depth = 1;
        let blockLines = [];
        i++;
        while (i < lines.length && depth > 0) {
          const l = lines[i];
          let inString = false;
          for (let ci = 0; ci < l.length; ci++) {
            const ch = l[ci];
            if (inString) {
              if (ch === '\\') {
                ci++; // skip escaped character
              } else if (ch === '"') {
                inString = false;
              }
            } else {
              if (ch === '"') {
                inString = true;
              } else if (ch === '{') {
                depth++;
              } else if (ch === '}') {
                depth--;
                if (depth === 0) break;
              }
            }
          }
          if (depth > 0) blockLines.push(l);
          i++;
        }

        // Parse attributes from blockLines
        const blockText = blockLines.join('\n');
        const varDef = { name, type: null, description: null };

        // Extract description (single-line string)
        const descMatch = blockText.match(/^\s*description\s*=\s*"((?:[^"\\]|\\.)*)"/m);
        if (descMatch) {
          varDef.description = descMatch[1];
        }

        // Extract type — may be multi-line (balanced parens)
        const typeRaw = extractAttributeValue(blockText, 'type');
        if (typeRaw !== null) {
          varDef.type = typeRaw.trim();
        }

        // Extract default — may be multi-line
        const defaultRaw = extractAttributeValue(blockText, 'default');
        if (defaultRaw !== null) {
          varDef.default = parseDefaultValue(defaultRaw.trim());
        }

        variables.push(varDef);
        continue;
      }

      // Check for a malformed variable block (variable keyword but no name)
      const malformedMatch = line.match(/^variable\s*\{/);
      if (malformedMatch) {
        throw new TFVarsGenerationError(
          'PARSE_ERROR',
          `Malformed variable block at line ${i + 1}: missing variable name`,
          { line: i + 1 }
        );
      }

      i++;
    }

    if (variables.length === 0) {
      process.stderr.write('Warning: no variable blocks found in ' + filePath + '\n');
      return [];
    }

    return variables;
  }

  /**
   * Map JSON_Config fields to the parsed variable definitions.
   *
   * @param {object}               jsonConfig - The JSON_Config object from JSONGenerator
   * @param {VariableDefinition[]} varDefs    - Parsed variable definitions
   * @returns {MappedVariable[]}
   */
  mapConfigToVariables(jsonConfig, varDefs) {
    // Canonical JSON_Config fields mapped to variable names
    const JSON_CONFIG_MAPPING = {
      project_name: 'project_name',
      vpc_name: 'vpc_name',
      vpc_cidr: 'vpc_cidr',
      non_route_cidr: 'non_route_cidr',
      region: 'region',
      environment: 'environment',
      area: 'area',
      ecosistema: 'ecosistema',
      has_internet: 'has_internet',
      existing_vpc: 'existing_vpc',
      s3_enable_versioning: 's3_enable_versioning',
      main_rt: 'main_rt',
      subnets: 'subnets',
      route_tables: 'route_tables',
    };

    const warnings = [];
    const result = [];
    const seen = new Set();

    for (const varDef of varDefs) {
      const { name, type } = varDef;

      // Skip duplicate variable names
      if (seen.has(name)) continue;
      seen.add(name);

      // Check if this variable has a canonical JSON_Config mapping
      if (Object.prototype.hasOwnProperty.call(JSON_CONFIG_MAPPING, name)) {
        const configKey = JSON_CONFIG_MAPPING[name];

        // Special handling for subnets and route_tables: empty/absent → {}
        if (name === 'subnets') {
          const val = jsonConfig != null ? jsonConfig[configKey] : undefined;
          const isEmpty =
            val === undefined ||
            val === null ||
            (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) ||
            (Array.isArray(val) && val.length === 0);

          if (isEmpty) {
            const warning = 'Warning: JSON_Config.subnets is empty or absent; writing subnets = {}';
            process.stderr.write(warning + '\n');
            warnings.push(warning);
            result.push({ name, type, value: {}, source: 'json_config', warning });
          } else {
            result.push({ name, type, value: val, source: 'json_config' });
          }
          continue;
        }

        if (name === 'route_tables') {
          const val = jsonConfig != null ? jsonConfig[configKey] : undefined;
          const isEmpty =
            val === undefined ||
            val === null ||
            (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) ||
            (Array.isArray(val) && val.length === 0);

          if (isEmpty) {
            const warning = 'Warning: JSON_Config.route_tables is empty or absent; writing route_tables = {}';
            process.stderr.write(warning + '\n');
            warnings.push(warning);
            result.push({ name, type, value: {}, source: 'json_config', warning });
          } else {
            result.push({ name, type, value: val, source: 'json_config' });
          }
          continue;
        }

        // Regular canonical field
        // Use JSON value if the key exists with a defined value, else fall back to default
        const hasKey = jsonConfig != null &&
          Object.prototype.hasOwnProperty.call(jsonConfig, configKey) &&
          jsonConfig[configKey] !== undefined;
        if (hasKey) {
          result.push({ name, type, value: jsonConfig[configKey], source: 'json_config' });
        } else if (Object.prototype.hasOwnProperty.call(varDef, 'default')) {
          result.push({ name, type, value: varDef.default, source: 'default' });
        } else {
          const warning = `Warning: variable '${name}' has no JSON_Config mapping and no default; writing null`;
          process.stderr.write(warning + '\n');
          result.push({ name, type, value: null, source: 'null', warning });
        }
      } else {
        // No canonical mapping — fall back to default or null
        if (Object.prototype.hasOwnProperty.call(varDef, 'default')) {
          result.push({ name, type, value: varDef.default, source: 'default' });
        } else {
          const warning = `Warning: variable '${name}' has no JSON_Config mapping and no default; writing null`;
          process.stderr.write(warning + '\n');
          result.push({ name, type, value: null, source: 'null', warning });
        }
      }
    }

    return result;
  }

  /**
   * Format a single mapped variable as an HCL assignment string.
   *
   * @param {MappedVariable} mappedVar
   * @returns {string}
   * @throws {TFVarsGenerationError} FORMAT_ERROR if the value cannot be formatted
   */
  formatVariable(mappedVar) {
    try {
      const value = formatHCLValue(mappedVar.value, mappedVar.type, 0);
      return `${mappedVar.name} = ${value}`;
    } catch (err) {
      throw new TFVarsGenerationError(
        'FORMAT_ERROR',
        `Failed to format variable "${mappedVar.name}": ${err.message}`,
        { variable: mappedVar.name, type: mappedVar.type }
      );
    }
  }

  /**
   * Generate the full .tfvars content string from a JSON_Config and a variables.tf path.
   *
   * @param {object} jsonConfig        - The JSON_Config object from JSONGenerator
   * @param {string} varsTemplatePath  - Path to the variables.tf template file
   * @returns {Promise<GenerateResult>}
   * @throws {TFVarsGenerationError} FILE_NOT_FOUND | PARSE_ERROR | FORMAT_ERROR
   */
  async generate(jsonConfig, varsTemplatePath) {
    // Step 1: Parse variables.tf — let FILE_NOT_FOUND/PARSE_ERROR propagate
    const varDefs = await this.parseVariablesFile(varsTemplatePath);

    // Step 2: Handle zero-blocks case
    if (varDefs.length === 0) {
      return {
        content: '',
        variablesWritten: 0,
        warnings: [`Warning: no variable blocks found in ${varsTemplatePath}`],
      };
    }

    // Step 3: Map JSON_Config fields to variable definitions
    const mappedVars = this.mapConfigToVariables(jsonConfig, varDefs);

    // Step 4: Format each variable — let FORMAT_ERROR propagate
    const lines = mappedVars.map(mv => this.formatVariable(mv));

    // Step 5: Join with newline separator
    const content = lines.join('\n');

    // Step 6: Collect warnings from MappedVariable objects
    const warnings = mappedVars
      .filter(mv => mv.warning != null)
      .map(mv => mv.warning);

    return {
      content,
      variablesWritten: mappedVars.length,
      warnings,
    };
  }
}
