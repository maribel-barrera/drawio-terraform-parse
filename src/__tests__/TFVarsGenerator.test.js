// src/__tests__/TFVarsGenerator.test.js
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { jest } from '@jest/globals';
import { TFVarsGenerator, TFVarsGenerationError } from '../TFVarsGenerator.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function writeTempFile(content) {
  const path = join(tmpdir(), `tfvars-unit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.tf`);
  await writeFile(path, content, 'utf8');
  return path;
}

async function withTempFile(content, fn) {
  const path = await writeTempFile(content);
  try {
    return await fn(path);
  } finally {
    await unlink(path).catch(() => {});
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TFVarsGenerator.parseVariablesFile', () => {
  let generator;

  beforeEach(() => {
    generator = new TFVarsGenerator();
  });

  // ── Test 1: Parsing variables with various types ─────────────────────────

  test('parses string, bool, number, map, and list variables into correct VariableDefinition objects', async () => {
    const content = `
variable "project_name" {
  type        = string
  description = "The project name"
  default     = "my-project"
}

variable "enable_dns" {
  type        = bool
  description = "Enable DNS support"
  default     = true
}

variable "max_instances" {
  type        = number
  description = "Maximum number of instances"
  default     = 5
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones"
}
`;

    await withTempFile(content, async (path) => {
      const result = await generator.parseVariablesFile(path);

      expect(result).toHaveLength(5);

      // string variable
      const projectName = result.find(v => v.name === 'project_name');
      expect(projectName).toBeDefined();
      expect(projectName.type).toBe('string');
      expect(projectName.description).toBe('The project name');
      expect(projectName.default).toBe('my-project');

      // bool variable
      const enableDns = result.find(v => v.name === 'enable_dns');
      expect(enableDns).toBeDefined();
      expect(enableDns.type).toBe('bool');
      expect(enableDns.description).toBe('Enable DNS support');
      expect(enableDns.default).toBe(true);

      // number variable
      const maxInstances = result.find(v => v.name === 'max_instances');
      expect(maxInstances).toBeDefined();
      expect(maxInstances.type).toBe('number');
      expect(maxInstances.description).toBe('Maximum number of instances');
      expect(maxInstances.default).toBe(5);

      // map variable (no default)
      const tags = result.find(v => v.name === 'tags');
      expect(tags).toBeDefined();
      expect(tags.type).toBe('map(string)');
      expect(tags.description).toBe('Resource tags');
      expect(tags.default).toBeUndefined();

      // list variable (no default)
      const azs = result.find(v => v.name === 'availability_zones');
      expect(azs).toBeDefined();
      expect(azs.type).toBe('list(string)');
      expect(azs.description).toBe('List of availability zones');
      expect(azs.default).toBeUndefined();
    });
  });

  // ── Test 2: Parsing default values of various types ──────────────────────

  test('parses default values correctly for string, bool, number, and null', async () => {
    const content = `
variable "str_var" {
  type    = string
  default = "hello world"
}

variable "bool_true_var" {
  type    = bool
  default = true
}

variable "bool_false_var" {
  type    = bool
  default = false
}

variable "num_var" {
  type    = number
  default = 42
}

variable "null_var" {
  type    = string
  default = null
}
`;

    await withTempFile(content, async (path) => {
      const result = await generator.parseVariablesFile(path);

      expect(result).toHaveLength(5);

      const strVar = result.find(v => v.name === 'str_var');
      expect(strVar.default).toBe('hello world');

      const boolTrueVar = result.find(v => v.name === 'bool_true_var');
      expect(boolTrueVar.default).toBe(true);

      const boolFalseVar = result.find(v => v.name === 'bool_false_var');
      expect(boolFalseVar.default).toBe(false);

      const numVar = result.find(v => v.name === 'num_var');
      expect(numVar.default).toBe(42);

      const nullVar = result.find(v => v.name === 'null_var');
      expect(nullVar.default).toBeNull();
    });
  });

  // ── Test 3: Missing file throws FILE_NOT_FOUND ────────────────────────────

  test('throws TFVarsGenerationError with type FILE_NOT_FOUND when file does not exist', async () => {
    const nonExistentPath = join(tmpdir(), `does-not-exist-${Date.now()}.tf`);

    await expect(generator.parseVariablesFile(nonExistentPath)).rejects.toMatchObject({
      name: 'TFVarsGenerationError',
      type: 'FILE_NOT_FOUND',
    });
  });

  test('thrown FILE_NOT_FOUND error is an instance of TFVarsGenerationError', async () => {
    const nonExistentPath = join(tmpdir(), `does-not-exist-${Date.now()}.tf`);

    try {
      await generator.parseVariablesFile(nonExistentPath);
      throw new Error('Expected error was not thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TFVarsGenerationError);
      expect(err.type).toBe('FILE_NOT_FOUND');
    }
  });

  // ── Test 4: Malformed block throws PARSE_ERROR ────────────────────────────

  test('throws TFVarsGenerationError with type PARSE_ERROR for variable block without a name', async () => {
    const content = `
variable {
  type = string
}
`;

    await withTempFile(content, async (path) => {
      await expect(generator.parseVariablesFile(path)).rejects.toMatchObject({
        name: 'TFVarsGenerationError',
        type: 'PARSE_ERROR',
      });
    });
  });

  test('PARSE_ERROR includes line number in context', async () => {
    const content = `
variable "valid_var" {
  type = string
}

variable {
  type = number
}
`;

    await withTempFile(content, async (path) => {
      try {
        await generator.parseVariablesFile(path);
        throw new Error('Expected error was not thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TFVarsGenerationError);
        expect(err.type).toBe('PARSE_ERROR');
        expect(err.context).toHaveProperty('line');
        expect(typeof err.context.line).toBe('number');
      }
    });
  });

  // ── Test 5: Zero blocks emits warning and returns [] ─────────────────────

  test('returns empty array and emits warning to stderr when file has no variable blocks', async () => {
    const content = `
# This file has no variable blocks
# Just some comments

locals {
  foo = "bar"
}
`;

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      await withTempFile(content, async (path) => {
        const result = await generator.parseVariablesFile(path);

        expect(result).toEqual([]);
        expect(result).toHaveLength(0);

        // Warning must have been written to stderr
        expect(stderrSpy).toHaveBeenCalled();
        const allCalls = stderrSpy.mock.calls.map(args => String(args[0]));
        const hasWarning = allCalls.some(msg => msg.toLowerCase().includes('warning'));
        expect(hasWarning).toBe(true);
      });
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test('empty file returns empty array and emits warning to stderr', async () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      await withTempFile('', async (path) => {
        const result = await generator.parseVariablesFile(path);

        expect(result).toEqual([]);

        expect(stderrSpy).toHaveBeenCalled();
        const allCalls = stderrSpy.mock.calls.map(args => String(args[0]));
        const hasWarning = allCalls.some(msg => msg.toLowerCase().includes('warning'));
        expect(hasWarning).toBe(true);
      });
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

// ─── mapConfigToVariables Tests ─────────────────────────────────────────────

describe('TFVarsGenerator.mapConfigToVariables', () => {
  let generator;

  // Canonical six-field JSON_Config used across multiple tests
  const FULL_JSON_CONFIG = {
    project_name: 'my-project',
    vpc_cidr: '10.0.0.0/16',
    region: 'us-east-1',
    environment: 'dev',
    subnets: {
      'SUBNET-A': { cidr: '10.0.1.0/24', az: 'us-east-1a' },
    },
    route_tables: {
      'RT-A': { routes: [], associated_subnets: ['SUBNET-A'] },
    },
  };

  // Minimal varDefs covering all six canonical fields
  const SIX_FIELD_VARDEFS = [
    { name: 'project_name', type: 'string', description: null },
    { name: 'vpc_cidr',     type: 'string', description: null },
    { name: 'region',       type: 'string', description: null },
    { name: 'environment',  type: 'string', description: null },
    { name: 'subnets',      type: 'map(object({cidr=string,az=string}))', description: null },
    { name: 'route_tables', type: 'map(object({routes=list(string),associated_subnets=list(string)}))', description: null },
  ];

  beforeEach(() => {
    generator = new TFVarsGenerator();
  });

  // ── Test 1: All six canonical fields produce expected MappedVariable array ─

  test('known JSON_Config with all six canonical fields produces expected MappedVariable array', () => {
    const result = generator.mapConfigToVariables(FULL_JSON_CONFIG, SIX_FIELD_VARDEFS);

    expect(result).toHaveLength(6);

    const byName = Object.fromEntries(result.map(v => [v.name, v]));

    expect(byName.project_name).toMatchObject({ name: 'project_name', value: 'my-project',   source: 'json_config' });
    expect(byName.vpc_cidr).toMatchObject(    { name: 'vpc_cidr',     value: '10.0.0.0/16',  source: 'json_config' });
    expect(byName.region).toMatchObject(      { name: 'region',       value: 'us-east-1',    source: 'json_config' });
    expect(byName.environment).toMatchObject( { name: 'environment',  value: 'dev',           source: 'json_config' });
    expect(byName.subnets).toMatchObject(     { name: 'subnets',      value: FULL_JSON_CONFIG.subnets,      source: 'json_config' });
    expect(byName.route_tables).toMatchObject({ name: 'route_tables', value: FULL_JSON_CONFIG.route_tables, source: 'json_config' });
  });

  // ── Test 2: No mapping and no default → value=null, source='null', warning ─

  test('variable with no JSON_Config mapping and no default produces value=null, source=null, and a warning', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const varDefs = [{ name: 'unknown_var', type: 'string', description: null }];
      const result = generator.mapConfigToVariables({}, varDefs);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBeNull();
      expect(result[0].source).toBe('null');
      expect(typeof result[0].warning).toBe('string');
      expect(result[0].warning.length).toBeGreaterThan(0);

      // Warning must have been written to stderr
      expect(stderrSpy).toHaveBeenCalled();
      const allCalls = stderrSpy.mock.calls.map(args => String(args[0]));
      const hasWarning = allCalls.some(msg => msg.toLowerCase().includes('warning'));
      expect(hasWarning).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  // ── Test 3: Empty subnets → value={}, source='json_config', warning ────────

  test('empty subnets in JSON_Config produces value={}, source=json_config, and a warning', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const jsonConfig = { ...FULL_JSON_CONFIG, subnets: {} };
      const varDefs = [{ name: 'subnets', type: 'map(object({}))', description: null }];
      const result = generator.mapConfigToVariables(jsonConfig, varDefs);

      expect(result).toHaveLength(1);
      expect(result[0].value).toEqual({});
      expect(result[0].source).toBe('json_config');
      expect(typeof result[0].warning).toBe('string');
      expect(result[0].warning.length).toBeGreaterThan(0);

      expect(stderrSpy).toHaveBeenCalled();
      const allCalls = stderrSpy.mock.calls.map(args => String(args[0]));
      const hasWarning = allCalls.some(msg => msg.toLowerCase().includes('warning'));
      expect(hasWarning).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  // ── Test 4: Empty route_tables → value={}, source='json_config', warning ───

  test('empty route_tables in JSON_Config produces value={}, source=json_config, and a warning', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const jsonConfig = { ...FULL_JSON_CONFIG, route_tables: {} };
      const varDefs = [{ name: 'route_tables', type: 'map(object({}))', description: null }];
      const result = generator.mapConfigToVariables(jsonConfig, varDefs);

      expect(result).toHaveLength(1);
      expect(result[0].value).toEqual({});
      expect(result[0].source).toBe('json_config');
      expect(typeof result[0].warning).toBe('string');
      expect(result[0].warning.length).toBeGreaterThan(0);

      expect(stderrSpy).toHaveBeenCalled();
      const allCalls = stderrSpy.mock.calls.map(args => String(args[0]));
      const hasWarning = allCalls.some(msg => msg.toLowerCase().includes('warning'));
      expect(hasWarning).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  // ── Test 5: No mapping but has default → uses default, source='default' ────

  test('variable with no JSON_Config mapping but with a default uses the default value', () => {
    const varDefs = [{ name: 'unknown_with_default', type: 'string', description: null, default: 'fallback-value' }];
    const result = generator.mapConfigToVariables({}, varDefs);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('fallback-value');
    expect(result[0].source).toBe('default');
    expect(result[0].warning).toBeUndefined();
  });

  // ── Test 6: Absent subnets (undefined) → value={}, source='json_config', warning

  test('absent subnets (undefined) produces value={}, source=json_config, and a warning', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const jsonConfig = { project_name: 'x', vpc_cidr: '10.0.0.0/16', region: 'us-east-1', environment: 'dev' };
      // subnets key is absent entirely
      const varDefs = [{ name: 'subnets', type: 'map(object({}))', description: null }];
      const result = generator.mapConfigToVariables(jsonConfig, varDefs);

      expect(result).toHaveLength(1);
      expect(result[0].value).toEqual({});
      expect(result[0].source).toBe('json_config');
      expect(typeof result[0].warning).toBe('string');

      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });

  // ── Test 7: Absent route_tables (undefined) → value={}, source='json_config', warning

  test('absent route_tables (undefined) produces value={}, source=json_config, and a warning', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const jsonConfig = { project_name: 'x', vpc_cidr: '10.0.0.0/16', region: 'us-east-1', environment: 'dev' };
      // route_tables key is absent entirely
      const varDefs = [{ name: 'route_tables', type: 'map(object({}))', description: null }];
      const result = generator.mapConfigToVariables(jsonConfig, varDefs);

      expect(result).toHaveLength(1);
      expect(result[0].value).toEqual({});
      expect(result[0].source).toBe('json_config');
      expect(typeof result[0].warning).toBe('string');

      expect(stderrSpy).toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

// ─── formatVariable Tests ────────────────────────────────────────────────────

describe('TFVarsGenerator.formatVariable', () => {
  let generator;

  beforeEach(() => {
    generator = new TFVarsGenerator();
  });

  // ── Test 1: string type → double-quoted value ─────────────────────────────

  test('formats string type as double-quoted value', () => {
    const result = generator.formatVariable({ name: 'project_name', type: 'string', value: 'my-project' });
    expect(result).toBe('project_name = "my-project"');
  });

  // ── Test 2: bool type → unquoted literal ─────────────────────────────────

  test('formats bool type true as unquoted literal', () => {
    const result = generator.formatVariable({ name: 'enable_dns', type: 'bool', value: true });
    expect(result).toBe('enable_dns = true');
  });

  test('formats bool type false as unquoted literal', () => {
    const result = generator.formatVariable({ name: 'enable_dns', type: 'bool', value: false });
    expect(result).toBe('enable_dns = false');
  });

  // ── Test 3: number type → unquoted numeric ────────────────────────────────

  test('formats number type as unquoted numeric', () => {
    const result = generator.formatVariable({ name: 'max_instances', type: 'number', value: 42 });
    expect(result).toBe('max_instances = 42');
  });

  // ── Test 4: map(string) type with object value → { key = "value" } block ──

  test('formats map(string) type with object value using block syntax', () => {
    const result = generator.formatVariable({ name: 'tags', type: 'map(string)', value: { env: 'dev' } });
    expect(result).toBe('tags = {\n  env = "dev"\n}');
  });

  // ── Test 5: list(string) type with array value → ["a", "b"] syntax ────────

  test('formats list(string) type with array value using bracket syntax', () => {
    const result = generator.formatVariable({ name: 'azs', type: 'list(string)', value: ['a', 'b'] });
    expect(result).toBe('azs = ["a", "b"]');
  });

  // ── Test 6: null value → "null" regardless of type ───────────────────────

  test('formats null value as unquoted null for string type', () => {
    const result = generator.formatVariable({ name: 'project_name', type: 'string', value: null });
    expect(result).toBe('project_name = null');
  });

  test('formats null value as unquoted null for map type', () => {
    const result = generator.formatVariable({ name: 'tags', type: 'map(string)', value: null });
    expect(result).toBe('tags = null');
  });

  test('formats null value as unquoted null for list type', () => {
    const result = generator.formatVariable({ name: 'azs', type: 'list(string)', value: null });
    expect(result).toBe('azs = null');
  });

  // ── Test 7: Nested objects use 2-space indentation per level ─────────────

  test('nested object values use 2-space indentation per nesting level', () => {
    const value = { subnet_a: { cidr: '10.0.1.0/24' } };
    const result = generator.formatVariable({ name: 'subnets', type: 'map(string)', value });
    // Top-level keys indented 2 spaces, nested keys indented 4 spaces
    expect(result).toContain('  subnet_a = ');
    expect(result).toContain('    cidr = ');
  });

  // ── Test 8: Balanced braces and brackets for complex nested objects ────────

  test('produces balanced braces for nested object values', () => {
    const value = { a: { b: 'c' } };
    const result = generator.formatVariable({ name: 'nested', type: 'map(string)', value });
    const openBraces = (result.match(/\{/g) || []).length;
    const closeBraces = (result.match(/\}/g) || []).length;
    expect(openBraces).toBe(closeBraces);
  });

  test('produces balanced brackets for list values', () => {
    const result = generator.formatVariable({ name: 'items', type: 'list(string)', value: ['x', 'y', 'z'] });
    const openBrackets = (result.match(/\[/g) || []).length;
    const closeBrackets = (result.match(/\]/g) || []).length;
    expect(openBrackets).toBe(closeBrackets);
  });
});

// ─── generate Tests ──────────────────────────────────────────────────────────

describe('TFVarsGenerator.generate', () => {
  let generator;

  beforeEach(() => {
    generator = new TFVarsGenerator();
  });

  // ── Test 1: Full pipeline with arqui-test.json and variables.tf ───────────
  // Requirements: 1.1

  test('full pipeline with arqui-test.json and variables.tf produces expected .tfvars content', async () => {
    // Read arqui-test.json from workspace root
    const { readFile: fsReadFile } = await import('fs/promises');
    const { resolve } = await import('path');
    const { fileURLToPath } = await import('url');

    // Resolve workspace root (two levels up from src/__tests__)
    const __dirname = fileURLToPath(new URL('.', import.meta.url));
    const workspaceRoot = resolve(__dirname, '..', '..');

    const jsonConfigRaw = await fsReadFile(resolve(workspaceRoot, 'arqui-test.json'), 'utf8');
    const jsonConfig = JSON.parse(jsonConfigRaw);

    const varsTemplatePath = resolve(workspaceRoot, 'variables.tf');

    const result = await generator.generate(jsonConfig, varsTemplatePath);

    // Result shape
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('variablesWritten');
    expect(result).toHaveProperty('warnings');

    // Content is a non-empty string
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);

    // variablesWritten is positive
    expect(result.variablesWritten).toBeGreaterThan(0);

    // warnings is an array
    expect(Array.isArray(result.warnings)).toBe(true);

    // Key assignments are present in the content
    expect(result.content).toContain('project_name = ');
    expect(result.content).toContain('vpc_cidr = ');
    expect(result.content).toContain('region = ');
    expect(result.content).toContain('environment = ');

    // Values from arqui-test.json are reflected
    expect(result.content).toContain('"paperless"');
    expect(result.content).toContain('"10.102.67.0/24"');
    expect(result.content).toContain('"us-east-1"');
    expect(result.content).toContain('"dev"');
  });

  // ── Test 2: Zero-block variables.tf produces empty content and a warning ──
  // Requirements: 2.7

  test('zero-block variables.tf produces empty content and a warning in the result', async () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      await withTempFile('# no variable blocks here\n', async (path) => {
        const result = await generator.generate({}, path);

        expect(result.content).toBe('');
        expect(result.variablesWritten).toBe(0);
        expect(Array.isArray(result.warnings)).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
