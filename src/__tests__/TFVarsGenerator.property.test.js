// src/__tests__/TFVarsGenerator.property.test.js
import fc from 'fast-check';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TFVarsGenerator } from '../TFVarsGenerator.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Escape a string so it is safe to embed inside HCL double-quotes.
 * Only backslash and double-quote need escaping for our purposes.
 */
function hclEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Format a VariableDefinition-like object into a `variable "name" { ... }` block.
 */
function formatVariableBlock({ name, type, description, default: def }) {
  const lines = [`variable "${name}" {`];
  if (type !== null && type !== undefined) {
    lines.push(`  type        = ${type}`);
  }
  if (description !== null && description !== undefined) {
    lines.push(`  description = "${hclEscape(description)}"`);
  }
  if (def !== undefined) {
    if (def === null) {
      lines.push(`  default     = null`);
    } else if (typeof def === 'boolean') {
      lines.push(`  default     = ${def}`);
    } else if (typeof def === 'number') {
      lines.push(`  default     = ${def}`);
    } else if (typeof def === 'string') {
      lines.push(`  default     = "${hclEscape(def)}"`);
    }
    // Skip complex defaults (objects/arrays) — keep test scope simple
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Write content to a temp file and return its path.
 */
async function writeTempFile(content) {
  const path = join(tmpdir(), `tfvars-test-${Date.now()}-${Math.random().toString(36).slice(2)}.tf`);
  await writeFile(path, content, 'utf8');
  return path;
}

// ─── Arbitraries ────────────────────────────────────────────────────────────

/** Valid Terraform identifier: starts with letter/underscore, then alphanumeric/underscore */
const tfIdentifier = fc
  .tuple(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
                    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '_'),
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k',
                                'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v',
                                'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6',
                                '7', '8', '9', '_'), { minLength: 0, maxLength: 15 })
  )
  .map(([first, rest]) => first + rest);

/** Simple Terraform type strings that the parser can round-trip cleanly */
const tfType = fc.constantFrom('string', 'bool', 'number', 'list(string)', 'map(string)');

/** Description strings that are safe inside HCL double-quotes (no newlines, no raw quotes) */
const safeDescription = fc.stringOf(
  fc.char().filter(c => c !== '"' && c !== '\\' && c !== '\n' && c !== '\r'),
  { minLength: 0, maxLength: 60 }
);

/** Simple scalar default values (no complex objects/lists to keep the test focused) */
const scalarDefault = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer({ min: -999, max: 999 }),
  fc.stringOf(
    fc.char().filter(c => c !== '"' && c !== '\\' && c !== '\n' && c !== '\r'),
    { minLength: 0, maxLength: 40 }
  )
);

/**
 * Arbitrary for a single VariableDefinition with optional fields.
 * `name` is always present; type/description/default may be null/undefined.
 */
const variableDefinitionArb = fc.record({
  name: tfIdentifier,
  type: fc.oneof(tfType, fc.constant(null)),
  description: fc.oneof(safeDescription, fc.constant(null)),
  default: fc.oneof(scalarDefault, fc.constant(undefined)),
});

/**
 * Arbitrary for an array of VariableDefinitions with unique names.
 */
const uniqueVarDefsArb = fc
  .array(variableDefinitionArb, { minLength: 1, maxLength: 10 })
  .filter(defs => {
    const names = defs.map(d => d.name);
    return new Set(names).size === names.length;
  });

// ─── Arbitraries (Property 1) ───────────────────────────────────────────────

/** The six canonical JSON_Config field names */
const CANONICAL_FIELDS = ['project_name', 'vpc_cidr', 'region', 'environment', 'subnets', 'route_tables'];

/** Simple scalar value for canonical string fields */
const scalarStringValue = fc.stringOf(
  fc.char().filter(c => c !== '"' && c !== '\\' && c !== '\n' && c !== '\r'),
  { minLength: 1, maxLength: 40 }
);

/** Non-empty object value (for subnets / route_tables) */
const nonEmptyObjectValue = fc
  .record({ key: scalarStringValue, val: scalarStringValue })
  .map(({ key, val }) => ({ [key]: val }));

/**
 * Arbitrary for a JSON_Config object — may include any subset of the six
 * canonical fields (including none of them).
 */
const jsonConfigArb = fc.record(
  {
    project_name: fc.oneof(scalarStringValue, fc.constant(undefined)),
    vpc_cidr:     fc.oneof(scalarStringValue, fc.constant(undefined)),
    region:       fc.oneof(scalarStringValue, fc.constant(undefined)),
    environment:  fc.oneof(scalarStringValue, fc.constant(undefined)),
    subnets:      fc.oneof(nonEmptyObjectValue, fc.constant(undefined)),
    route_tables: fc.oneof(nonEmptyObjectValue, fc.constant(undefined)),
  },
  { requiredKeys: [] }
);

/**
 * Arbitrary for a VariableDefinition whose name is either one of the six
 * canonical fields or a random non-canonical identifier.
 */
const varDefForProperty1 = fc.oneof(
  // Canonical variable (name is one of the six)
  fc.record({
    name:        fc.constantFrom(...CANONICAL_FIELDS),
    type:        fc.oneof(tfType, fc.constant(null)),
    description: fc.oneof(safeDescription, fc.constant(null)),
    default:     fc.oneof(scalarDefault, fc.constant(undefined)),
  }),
  // Non-canonical variable (random name that won't collide with canonical fields)
  fc.record({
    name:        tfIdentifier.filter(n => !CANONICAL_FIELDS.includes(n)),
    type:        fc.oneof(tfType, fc.constant(null)),
    description: fc.oneof(safeDescription, fc.constant(null)),
    default:     fc.oneof(scalarDefault, fc.constant(undefined)),
  })
);

/**
 * Array of VariableDefinitions with unique names (mix of canonical and non-canonical).
 */
const uniqueVarDefsForProperty1 = fc
  .array(varDefForProperty1, { minLength: 1, maxLength: 10 })
  .filter(defs => {
    const names = defs.map(d => d.name);
    return new Set(names).size === names.length;
  });

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TFVarsGenerator Property Tests', () => {
  let generator;

  beforeEach(() => {
    generator = new TFVarsGenerator();
  });

  // Feature: tfvars-generator, Property 1: Variable resolution
  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * For any JSON_Config object and variables.tf with N variable blocks, every
   * variable in the generated output must use the value from JSON_Config when a
   * mapping exists, and the default value from variables.tf when no mapping
   * exists and a default is defined. When neither exists, value must be null
   * and source must be 'null'.
   */
  test('Property 1: Variable resolution', () => {
    fc.assert(
      fc.property(jsonConfigArb, uniqueVarDefsForProperty1, (jsonConfig, varDefs) => {
        const result = generator.mapConfigToVariables(jsonConfig, varDefs);

        // Output must have exactly one entry per variable definition
        expect(result).toHaveLength(varDefs.length);

        for (const varDef of varDefs) {
          const mapped = result.find(r => r.name === varDef.name);
          expect(mapped).toBeDefined();

          const isCanonical = CANONICAL_FIELDS.includes(varDef.name);
          const configValue = jsonConfig != null ? jsonConfig[varDef.name] : undefined;
          const hasConfigValue = isCanonical && configValue !== undefined;
          const hasDefault = Object.prototype.hasOwnProperty.call(varDef, 'default');

          // subnets and route_tables always resolve via json_config (empty → {})
          const isSpecialEmpty = (varDef.name === 'subnets' || varDef.name === 'route_tables');

          if (isSpecialEmpty) {
            // Requirement 3.9/3.10: subnets/route_tables always use json_config source
            expect(mapped.source).toBe('json_config');
          } else if (hasConfigValue) {
            // Requirement 3.1–3.6: canonical field present in JSON_Config
            expect(mapped.source).toBe('json_config');
            expect(mapped.value).toEqual(configValue);
          } else if (hasDefault) {
            // Requirement 3.7: no JSON_Config mapping but default exists
            expect(mapped.source).toBe('default');
            expect(mapped.value).toEqual(varDef.default);
          } else {
            // Requirement 3.8: no mapping and no default → null + warning
            expect(mapped.source).toBe('null');
            expect(mapped.value).toBeNull();
            expect(mapped.warning).toBeDefined();
            expect(typeof mapped.warning).toBe('string');
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: tfvars-generator, Property 2: Field mapping completeness
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
   *
   * For any valid JSON_Config object, the six canonical fields (project_name,
   * vpc_cidr, region, environment, subnets, route_tables) must each appear in
   * the generated MappedVariable array with values equal to their corresponding
   * JSON_Config fields, preserving nested object structure for subnets and
   * route_tables.
   */
  test('Property 2: Field mapping completeness', () => {
    // Arbitrary for a non-empty object (for subnets / route_tables)
    const nestedObjectArb = fc
      .array(
        fc.tuple(
          scalarStringValue,
          fc.oneof(
            scalarStringValue,
            fc.record({ key: scalarStringValue, val: scalarStringValue }).map(({ key, val }) => ({ [key]: val }))
          )
        ),
        { minLength: 1, maxLength: 5 }
      )
      .map(pairs => Object.fromEntries(pairs));

    // JSON_Config with ALL six canonical fields always present and non-empty
    const fullJsonConfigArb = fc.record({
      project_name: scalarStringValue,
      vpc_cidr:     scalarStringValue,
      region:       scalarStringValue,
      environment:  scalarStringValue,
      subnets:      nestedObjectArb,
      route_tables: nestedObjectArb,
    });

    // varDefs that include all six canonical fields
    const allSixVarDefsArb = fc.record({
      project_name_type: fc.oneof(tfType, fc.constant(null)),
      vpc_cidr_type:     fc.oneof(tfType, fc.constant(null)),
      region_type:       fc.oneof(tfType, fc.constant(null)),
      environment_type:  fc.oneof(tfType, fc.constant(null)),
      subnets_type:      fc.oneof(tfType, fc.constant(null)),
      route_tables_type: fc.oneof(tfType, fc.constant(null)),
    }).map(types => [
      { name: 'project_name', type: types.project_name_type, description: null },
      { name: 'vpc_cidr',     type: types.vpc_cidr_type,     description: null },
      { name: 'region',       type: types.region_type,       description: null },
      { name: 'environment',  type: types.environment_type,  description: null },
      { name: 'subnets',      type: types.subnets_type,      description: null },
      { name: 'route_tables', type: types.route_tables_type, description: null },
    ]);

    fc.assert(
      fc.property(fullJsonConfigArb, allSixVarDefsArb, (jsonConfig, varDefs) => {
        const result = generator.mapConfigToVariables(jsonConfig, varDefs);

        // All six canonical fields must appear in the output
        for (const field of CANONICAL_FIELDS) {
          const mapped = result.find(r => r.name === field);
          expect(mapped).toBeDefined();

          // Source must be json_config for all six fields
          expect(mapped.source).toBe('json_config');

          // Value must equal the corresponding JSON_Config field
          expect(mapped.value).toEqual(jsonConfig[field]);
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: tfvars-generator, Property 8: variables.tf parse round-trip
  /**
   * **Validates: Requirements 2.8**
   *
   * For any valid variables.tf content, parsing the file into VariableDefinition
   * objects and then formatting those definitions back into HCL and re-parsing
   * must produce an equivalent set of variable definitions.
   */
  test('Property 8: variables.tf parse round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueVarDefsArb, async (defs) => {
        // First pass: format → write → parse
        const content = defs.map(formatVariableBlock).join('\n\n');
        const filePath = await writeTempFile(content);

        let firstParsed;
        try {
          firstParsed = await generator.parseVariablesFile(filePath);
        } finally {
          await unlink(filePath).catch(() => {});
        }

        // Second pass: re-format the parsed result → write → parse again
        const reformatted = firstParsed.map(formatVariableBlock).join('\n\n');
        const filePath2 = await writeTempFile(reformatted);

        let secondParsed;
        try {
          secondParsed = await generator.parseVariablesFile(filePath2);
        } finally {
          await unlink(filePath2).catch(() => {});
        }

        // Both passes must produce the same count
        expect(secondParsed).toHaveLength(firstParsed.length);

        // Each variable in the second parse must match the first parse
        for (const first of firstParsed) {
          const second = secondParsed.find(p => p.name === first.name);
          expect(second).toBeDefined();
          expect(second.type).toBe(first.type);
          expect(second.description).toBe(first.description);
          if (first.default === undefined) {
            expect(second.default).toBeUndefined();
          } else {
            expect(second.default).toEqual(first.default);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: tfvars-generator, Property 3: HCL type formatting
  /**
   * **Validates: Requirements 4.2, 4.3, 4.4, 4.5**
   *
   * For any variable with a declared Terraform type, the formatted HCL value
   * must match the expected syntax for that type: string values are
   * double-quoted, bool and number values are unquoted, map/object values use
   * { key = value } block syntax, and list/tuple values use [...] syntax.
   */
  test('Property 3: HCL type formatting', () => {
    // Arbitrary for safe string values (no backslash, no double-quote, no newlines)
    const safeStr = fc.stringOf(
      fc.char().filter(c => c !== '"' && c !== '\\' && c !== '\n' && c !== '\r'),
      { minLength: 0, maxLength: 30 }
    );

    // Arbitrary for a simple object with string values (for map/object types)
    const simpleObjectArb = fc
      .array(fc.tuple(safeStr.filter(s => s.length > 0 && s.trim().length > 0), safeStr), { minLength: 1, maxLength: 5 })
      .map(pairs => Object.fromEntries(pairs));

    // Arbitrary for a flat array of strings (for list/tuple types)
    const stringArrayArb = fc.array(safeStr, { minLength: 0, maxLength: 5 });

    // (type, value) pair arbitraries for each Terraform type
    const stringPair = fc.record({
      type: fc.constant('string'),
      value: safeStr,
    });

    const boolPair = fc.record({
      type: fc.constant('bool'),
      value: fc.boolean(),
    });

    const numberPair = fc.record({
      type: fc.constant('number'),
      value: fc.oneof(fc.integer({ min: -1000, max: 1000 }), fc.double({ min: -1000, max: 1000, noNaN: true })),
    });

    const mapPair = fc.record({
      type: fc.constantFrom('map(string)', 'map(any)'),
      value: simpleObjectArb,
    });

    const objectPair = fc.record({
      type: fc.constant('object({})'),
      value: simpleObjectArb,
    });

    const listPair = fc.record({
      type: fc.constantFrom('list(string)', 'list(any)'),
      value: stringArrayArb,
    });

    const tuplePair = fc.record({
      type: fc.constant('tuple([string])'),
      value: stringArrayArb,
    });

    const typedPair = fc.oneof(stringPair, boolPair, numberPair, mapPair, objectPair, listPair, tuplePair);

    fc.assert(
      fc.property(typedPair, tfIdentifier, ({ type, value }, varName) => {
        const mappedVar = { name: varName, type, value };
        const formatted = generator.formatVariable(mappedVar);

        // Top-level format: `<name> = <hclValue>`
        expect(formatted).toMatch(new RegExp(`^${varName} = `));
        const hclValue = formatted.slice(`${varName} = `.length);

        if (type === 'string') {
          // Req 4.2: string values must be double-quoted
          expect(hclValue).toMatch(/^".*"$/s);
        } else if (type === 'bool') {
          // Req 4.3: bool values must be unquoted literal true/false
          expect(hclValue === 'true' || hclValue === 'false').toBe(true);
        } else if (type === 'number') {
          // Req 4.3: number values must be unquoted numeric literals (including scientific notation)
          expect(hclValue).toMatch(/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i);
        } else if (type.startsWith('map(') || type.startsWith('object(')) {
          // Req 4.4: map/object values must use { key = value } block syntax
          expect(hclValue).toMatch(/^\{[\s\S]*\}$/);
          // Each key-value pair inside must use = assignment syntax
          const innerLines = hclValue
            .split('\n')
            .slice(1, -1) // remove opening { and closing }
            .filter(l => l.trim().length > 0);
          for (const line of innerLines) {
            // Line must be indented and contain an = assignment
            expect(line).toMatch(/^\s+.+ = /);
          }
        } else if (type.startsWith('list(') || type.startsWith('tuple(')) {
          // Req 4.5: list/tuple values must use [...] syntax
          expect(hclValue).toMatch(/^\[[\s\S]*\]$/);
          // Non-empty lists: verify the output contains quoted elements
          // (avoid naive comma-split since element values may contain commas)
          if (value.length > 0) {
            const inner = hclValue.slice(1, -1).trim();
            if (inner.length > 0) {
              // Each element must be a double-quoted string: starts with " and ends with "
              // We verify by checking the first and last non-whitespace chars of each element
              // using a proper quoted-string pattern that handles escaped chars
              expect(inner).toMatch(/^"(\\.|[^"\\])*"(,\s*"(\\.|[^"\\])*")*$/s);
            }
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: tfvars-generator, Property 4: HCL structural validity
  /**
   * **Validates: Requirements 4.1, 4.7**
   *
   * For any valid JSON_Config object and variables.tf, the generated .tfvars
   * content must match the pattern `<identifier> = <value>` for every top-level
   * assignment, with no unclosed braces or brackets.
   */
  test('Property 4: HCL structural validity', () => {
    // Arbitrary for a non-empty object (for subnets / route_tables)
    const nestedObjectArb = fc
      .array(
        fc.tuple(
          scalarStringValue,
          fc.oneof(
            scalarStringValue,
            fc.record({ key: scalarStringValue, val: scalarStringValue }).map(({ key, val }) => ({ [key]: val }))
          )
        ),
        { minLength: 1, maxLength: 4 }
      )
      .map(pairs => Object.fromEntries(pairs));

    // JSON_Config with all six canonical fields always present
    const fullJsonConfigArb = fc.record({
      project_name: scalarStringValue,
      vpc_cidr:     scalarStringValue,
      region:       scalarStringValue,
      environment:  scalarStringValue,
      subnets:      nestedObjectArb,
      route_tables: nestedObjectArb,
    });

    // varDefs that include all six canonical fields with various types
    const allSixVarDefsArb = fc.record({
      project_name_type: fc.constantFrom('string', null),
      vpc_cidr_type:     fc.constantFrom('string', null),
      region_type:       fc.constantFrom('string', null),
      environment_type:  fc.constantFrom('string', null),
      subnets_type:      fc.constantFrom('map(string)', 'map(any)', null),
      route_tables_type: fc.constantFrom('map(string)', 'map(any)', null),
    }).map(types => [
      { name: 'project_name', type: types.project_name_type, description: null },
      { name: 'vpc_cidr',     type: types.vpc_cidr_type,     description: null },
      { name: 'region',       type: types.region_type,       description: null },
      { name: 'environment',  type: types.environment_type,  description: null },
      { name: 'subnets',      type: types.subnets_type,      description: null },
      { name: 'route_tables', type: types.route_tables_type, description: null },
    ]);

    fc.assert(
      fc.property(fullJsonConfigArb, allSixVarDefsArb, (jsonConfig, varDefs) => {
        const mappedVars = generator.mapConfigToVariables(jsonConfig, varDefs);

        // Format each mapped variable and collect the lines
        const formattedLines = mappedVars.map(mv => generator.formatVariable(mv));

        // Req 4.1: every top-level assignment must match `<identifier> = <value>`
        for (const line of formattedLines) {
          // The first line of each formatted variable must be `<identifier> = <value>`
          const firstLine = line.split('\n')[0];
          expect(firstLine).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]* = .+/);
        }

        // Req 4.7: braces and brackets must be balanced across the full output
        const fullContent = formattedLines.join('\n');
        let braceCount = 0;
        let bracketCount = 0;
        let inString = false;
        for (let ci = 0; ci < fullContent.length; ci++) {
          const ch = fullContent[ci];
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
              braceCount++;
            } else if (ch === '}') {
              braceCount--;
            } else if (ch === '[') {
              bracketCount++;
            } else if (ch === ']') {
              bracketCount--;
            }
          }
        }
        expect(braceCount).toBe(0);
        expect(bracketCount).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: tfvars-generator, Property 5: Nested indentation
  /**
   * **Validates: Requirements 4.6**
   *
   * For any variable whose value is a nested object or map, every nested
   * key-value pair in the HCL output must be indented by exactly 2 spaces
   * per nesting level relative to its parent block.
   * Level 1 (inside top-level {}) = 2 spaces, level 2 (inside nested {}) = 4 spaces, etc.
   */
  test('Property 5: Nested indentation', () => {
    // Arbitrary for a safe identifier-like key (no special chars)
    const safeKey = fc
      .tuple(
        fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'),
        fc.stringOf(
          fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', '0', '1', '2', '_'),
          { minLength: 0, maxLength: 8 }
        )
      )
      .map(([first, rest]) => first + rest);

    // Arbitrary for a safe string value (no backslash, no double-quote, no newlines)
    const safeVal = fc.stringOf(
      fc.char().filter(c => c !== '"' && c !== '\\' && c !== '\n' && c !== '\r'),
      { minLength: 1, maxLength: 20 }
    );

    // Arbitrary for a level-2 nested object: { key: string }
    const level2ObjectArb = fc
      .array(fc.tuple(safeKey, safeVal), { minLength: 1, maxLength: 3 })
      .map(pairs => Object.fromEntries(pairs));

    // Arbitrary for a level-1 object that contains at least one nested object value
    // Structure: { key: { key: string } }  (at least 2 levels deep)
    const nestedObjectArb = fc
      .array(
        fc.tuple(safeKey, level2ObjectArb),
        { minLength: 1, maxLength: 3 }
      )
      .map(pairs => Object.fromEntries(pairs));

    // Optionally mix in some string values at level 1 alongside nested objects
    const mixedNestedObjectArb = fc
      .tuple(nestedObjectArb, fc.array(fc.tuple(safeKey, safeVal), { minLength: 0, maxLength: 2 }))
      .map(([nested, flat]) => {
        // Merge flat entries into the nested object (flat entries use string values)
        const merged = { ...nested };
        for (const [k, v] of flat) {
          if (!(k in merged)) merged[k] = v;
        }
        return merged;
      });

    /**
     * Count net brace depth change on a single line, skipping characters inside
     * double-quoted strings so that `{` or `}` inside a string value is ignored.
     */
    function netBraceDepth(line) {
      let delta = 0;
      let inStr = false;
      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        if (inStr) {
          if (ch === '\\') { ci++; } // skip escaped char
          else if (ch === '"') { inStr = false; }
        } else {
          if (ch === '"') { inStr = true; }
          else if (ch === '{') { delta++; }
          else if (ch === '}') { delta--; }
        }
      }
      return delta;
    }

    fc.assert(
      fc.property(
        mixedNestedObjectArb,
        tfIdentifier,
        fc.constantFrom('map(string)', 'object({})'),
        (nestedObj, varName, varType) => {
          const mappedVar = { name: varName, type: varType, value: nestedObj };
          const formatted = generator.formatVariable(mappedVar);
          const lines = formatted.split('\n');

          // Track brace depth to determine nesting level of each line.
          // depth 0 = top-level assignment line (e.g. "varname = {")
          // depth 1 = inside top-level {} → expected 2 spaces indent
          // depth 2 = inside nested {}    → expected 4 spaces indent
          let depth = 0;
          for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];
            const trimmed = line.trimStart();

            if (idx === 0) {
              // First line: "varname = {" — not a key-value pair, skip indentation check
              depth += netBraceDepth(line);
              continue;
            }

            if (trimmed.length === 0) continue; // skip blank lines

            // A closing brace line: depth decreases BEFORE we check indentation
            if (trimmed === '}') {
              depth--;
              const expectedSpaces = depth * 2;
              const actualSpaces = line.length - trimmed.length;
              expect(actualSpaces).toBe(expectedSpaces);
              continue;
            }

            // A key-value line (possibly ending with " = {" for nested objects)
            // Expected indentation = depth * 2 spaces
            const expectedSpaces = depth * 2;
            const actualSpaces = line.length - trimmed.length;
            expect(actualSpaces).toBe(expectedSpaces);

            // Update depth based on braces on this line (skipping quoted strings)
            depth += netBraceDepth(line);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: tfvars-generator, Property 6: TFVars generation round-trip
  /**
   * **Validates: Requirements 4.8**
   *
   * For any valid JSON_Config object, generating a .tfvars string and then
   * re-parsing the assignments from that string must produce a set of variable
   * assignments equivalent to the original mapped values.
   * Round-trip is asserted only for scalar string fields where the mapping is exact.
   */
  test('Property 6: TFVars generation round-trip', () => {
    // Arbitrary for safe scalar string values (no backslash, no double-quote, no newlines)
    const safeScalarStr = fc.stringOf(
      fc.char().filter(c => c !== '"' && c !== '\\' && c !== '\n' && c !== '\r'),
      { minLength: 0, maxLength: 40 }
    );

    // Arbitrary for a simple subnet/route_table entry: { key: string }
    const simpleMapArb = fc
      .array(
        fc.tuple(
          safeScalarStr.filter(s => s.length > 0),
          safeScalarStr
        ),
        { minLength: 1, maxLength: 3 }
      )
      .map(pairs => Object.fromEntries(pairs));

    // JSON_Config with all six canonical scalar fields + simple subnets/route_tables
    const roundTripConfigArb = fc.record({
      project_name: safeScalarStr,
      vpc_cidr:     safeScalarStr,
      region:       safeScalarStr,
      environment:  safeScalarStr,
      subnets:      simpleMapArb,
      route_tables: simpleMapArb,
    });

    // varDefs for the six canonical fields: string type for scalars, map(string) for maps
    const roundTripVarDefs = [
      { name: 'project_name', type: 'string',     description: null },
      { name: 'vpc_cidr',     type: 'string',     description: null },
      { name: 'region',       type: 'string',     description: null },
      { name: 'environment',  type: 'string',     description: null },
      { name: 'subnets',      type: 'map(string)', description: null },
      { name: 'route_tables', type: 'map(string)', description: null },
    ];

    /**
     * Re-parse top-level assignments from a .tfvars string.
     * Splits on lines matching `<identifier> = <value>` at depth 0.
     * Returns a map of { varName -> rawValue } for scalar (non-block) assignments.
     */
    function parseTopLevelAssignments(content) {
      const result = {};
      const lines = content.split('\n');
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)/);
        if (match) {
          const varName = match[1];
          let valueStr = match[2].trim();
          // If value starts with { or [, collect until balanced
          if (valueStr === '{' || valueStr.startsWith('{')) {
            let depth = 0;
            let collected = valueStr;
            for (const ch of valueStr) {
              if (ch === '{') depth++;
              else if (ch === '}') depth--;
            }
            i++;
            while (i < lines.length && depth > 0) {
              const nextLine = lines[i];
              collected += '\n' + nextLine;
              for (const ch of nextLine) {
                if (ch === '{') depth++;
                else if (ch === '}') depth--;
              }
              i++;
            }
            result[varName] = collected;
          } else {
            result[varName] = valueStr;
            i++;
          }
        } else {
          i++;
        }
      }
      return result;
    }

    fc.assert(
      fc.property(roundTripConfigArb, (jsonConfig) => {
        const mappedVars = generator.mapConfigToVariables(jsonConfig, roundTripVarDefs);
        const tfvarsContent = mappedVars.map(mv => generator.formatVariable(mv)).join('\n');

        const parsed = parseTopLevelAssignments(tfvarsContent);

        // Assert round-trip for scalar string fields
        const scalarFields = ['project_name', 'vpc_cidr', 'region', 'environment'];
        for (const field of scalarFields) {
          expect(parsed[field]).toBeDefined();
          // The formatted value is a double-quoted string: "value"
          // Unquote and unescape to recover the original string
          const raw = parsed[field];
          expect(raw).toMatch(/^".*"$/s);
          const unquoted = raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          expect(unquoted).toBe(jsonConfig[field]);
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: tfvars-generator, Property 7: variables.tf parsing completeness
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   *
   * For any valid `variables.tf` content containing N `variable` blocks,
   * parsing must return exactly N `VariableDefinition` objects, each with
   * the correct `name`, `type`, `description`, and `default` fields as
   * declared in the source.
   */
  test('Property 7: variables.tf parsing completeness', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueVarDefsArb, async (defs) => {
        // Build a variables.tf string from the generated definitions
        const content = defs.map(formatVariableBlock).join('\n\n');
        const filePath = await writeTempFile(content);

        let parsed;
        try {
          parsed = await generator.parseVariablesFile(filePath);
        } finally {
          await unlink(filePath).catch(() => {});
        }

        // Requirement 2.1 — count must match
        expect(parsed).toHaveLength(defs.length);

        for (let i = 0; i < defs.length; i++) {
          const original = defs[i];
          const result = parsed.find(p => p.name === original.name);

          // Each variable block must produce a VariableDefinition
          expect(result).toBeDefined();

          // Requirement 2.2 — type field
          if (original.type !== null && original.type !== undefined) {
            expect(result.type).toBe(original.type);
          } else {
            expect(result.type).toBeNull();
          }

          // Requirement 2.3 — description field
          if (original.description !== null && original.description !== undefined) {
            expect(result.description).toBe(original.description);
          } else {
            expect(result.description).toBeNull();
          }

          // Requirement 2.4 — default field
          if (original.default === undefined) {
            // No default attribute → property should be absent or undefined
            expect(result.default).toBeUndefined();
          } else if (original.default === null) {
            expect(result.default).toBeNull();
          } else if (typeof original.default === 'boolean') {
            expect(result.default).toBe(original.default);
          } else if (typeof original.default === 'number') {
            expect(result.default).toBe(original.default);
          } else {
            // string default
            expect(result.default).toBe(original.default);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
