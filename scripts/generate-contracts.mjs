#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const contractsDir = path.join(rootDir, 'contracts');
const outputFile = path.join(rootDir, 'extension/src/shared/contracts.ts');

async function main() {
  const schemaPaths = await collectSchemaFiles(contractsDir);
  if (schemaPaths.length === 0) {
    throw new Error(`В каталоге ${contractsDir} не найдено JSON Schema`);
  }

  const schemas = await loadSchemas(schemaPaths);
  const typeGenerator = new TypeGenerator(schemas);
  const ajvArtifacts = compileAjvArtifacts(schemas);

  const imports = new Set(['import type { ErrorObject, ValidateFunction } from \'ajv\';']);
  if (ajvArtifacts.helpers.usesFormats) {
    imports.add('import { fullFormats } from \'ajv-formats/dist/formats\';');
  }

  const helperLines = [];
  if (ajvArtifacts.helpers.usesFormats) {
    if (ajvArtifacts.helpers.usesUri) {
      helperLines.push('const formatUri = fullFormats.uri;');
    }
    if (ajvArtifacts.helpers.usesDateTime) {
      helperLines.push('const formatDateTime = fullFormats[\'date-time\'];');
    }
  }
  if (ajvArtifacts.helpers.usesUnicodeLength) {
    helperLines.push(
      [
        'const unicodeLength = (value: string): number => {',
        '  let length = 0;',
        '  for (const _ of value) {',
        '    length += 1;',
        '  }',
        '  return length;',
        '};',
      ].join('\n'),
    );
  }

  const fileSections = [
    '/* eslint-disable */',
    '/**',
    ' * Автогенерируемый модуль. Не редактируйте вручную.',
    ' * Скрипт генерации: scripts/generate-contracts.mjs',
    ' */',
    '',
    Array.from(imports).join('\n'),
  ];
  if (helperLines.length > 0) {
    fileSections.push('', helperLines.join('\n'));
  }

  fileSections.push(
    '',
    typeGenerator.emitAll(),
    '',
    generateSchemaExports(schemas),
    '',
    'export interface ContractDescriptor<T> {',
    '  readonly schema: unknown;',
    '  readonly validate: (value: unknown) => value is T;',
    '  readonly assert: (value: unknown) => asserts value is T;',
    '}',
    '',
    'export class ContractValidationError extends Error {',
    '  public readonly errors: ErrorObject[];',
    '',
    '  constructor(public readonly typeName: string, errors: ErrorObject[] = []) {',
    '    super(`Validation failed for contract "${typeName}"`);',
    '    this.name = \'ContractValidationError\';',
    '    this.errors = errors;',
    '  }',
    '}',
    '',
    'export function resetContractValidationState(): void {',
    '  // Валидаторы предкомпилированы; состояние кэша отсутствует.',
    '}',
    '',
    ajvArtifacts.runtime,
    '',
    'export const contractRegistry = {',
    ajvArtifacts.registryEntries.join('\n'),
    '} as const;',
    '',
    'type ExtractAssertedType<T> = T extends (value: unknown) => asserts value is infer R ? R : never;',
    'export type ContractType = keyof typeof contractRegistry;',
    '',
    'export function getContractDescriptor<T extends ContractType>(',
    '  type: T,',
    '): ContractDescriptor<ExtractAssertedType<(typeof contractRegistry)[T][\'assert\']>> {',
    '  return contractRegistry[type] as ContractDescriptor<ExtractAssertedType<(typeof contractRegistry)[T][\'assert\']>>;',
    '}',
    '',
  );

  await fs.writeFile(outputFile, fileSections.join('\n'), 'utf8');
}

async function collectSchemaFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSchemaFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.schema.json')) {
      files.push(fullPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function loadSchemas(paths) {
  const store = new Map();
  for (const schemaPath of paths) {
    const content = await fs.readFile(schemaPath, 'utf8');
    const json = JSON.parse(content);
    store.set(schemaPath, {
      path: schemaPath,
      json,
      literal: content.trim(),
    });
  }
  return store;
}

function generateSchemaExports(schemas) {
  const chunks = [];
  for (const { path: schemaPath, literal, json } of schemas.values()) {
    const typeName = ensureTypeName(json, schemaPath);
    const constName = toSchemaConstName(typeName);
    chunks.push(`export const ${constName} = ${literal} as const;`);
  }
  return chunks.join('\n');
}

function compileAjvArtifacts(schemas) {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    allowUnionTypes: true,
    code: { source: true },
  });
  addFormats(ajv);

  for (const { json } of schemas.values()) {
    ajv.addSchema(json);
  }

  const registryEntries = [];
  const validatorChunks = [];
  const helpersUsage = {
    usesFormats: false,
    usesUri: false,
    usesDateTime: false,
    usesUnicodeLength: false,
  };

  for (const { path: schemaPath, json } of schemas.values()) {
    const typeName = ensureTypeName(json, schemaPath);
    const schemaConst = toSchemaConstName(typeName);
    const validatorName = `validate${typeName}Fn`;
    const validateFn = `validate${typeName}`;
    const assertFn = `assert${typeName}`;

    const schemaId = json.$id ?? schemaPath;
    const validationFn = ajv.getSchema(schemaId);
    if (!validationFn) {
      throw new Error(`Ajv не нашёл схему для ${schemaId}`);
    }

    const code = standaloneCode(ajv, validationFn);
    const sanitized = sanitizeStandaloneCode(code, helpersUsage);
    validatorChunks.push(
      [
        `const ${validatorName}: ValidateFunction<${typeName}> = (() => {`,
        sanitized.body,
        `  return ${sanitized.exportedName} as ValidateFunction<${typeName}>;`,
        `})();`,
        '',
        `export function ${validateFn}(value: unknown): value is ${typeName} {`,
        `  return (${validatorName}(value) as boolean);`,
        `}`,
        '',
        `export function ${assertFn}(value: unknown): asserts value is ${typeName} {`,
        `  if (!${validateFn}(value)) {`,
        `    throw new ContractValidationError('${typeName}', ${validatorName}.errors ?? []);`,
        `  }`,
        `}`,
        '',
      ].join('\n'),
    );

    registryEntries.push(
      `  '${typeName}': { schema: ${schemaConst}, validate: ${validateFn}, assert: ${assertFn} },`,
    );

    helpersUsage.usesFormats ||= sanitized.helpers.usesFormats;
    helpersUsage.usesUri ||= sanitized.helpers.usesUri;
    helpersUsage.usesDateTime ||= sanitized.helpers.usesDateTime;
    helpersUsage.usesUnicodeLength ||= sanitized.helpers.usesUnicodeLength;
  }

  return {
    runtime: validatorChunks.join('\n'),
    registryEntries,
    helpers: helpersUsage,
  };
}

function sanitizeStandaloneCode(moduleCode, helpersUsage) {
  const exportMatch = moduleCode.match(/module\.exports = (\w+);/);
  if (!exportMatch) {
    throw new Error('Не удалось определить имя функции валидатора в standalone-коде Ajv');
  }

  let code = moduleCode.replace('"use strict";', '');
  code = code.replace(/module\.exports(?:\.default)? = \w+;/g, '');

  if (/fullFormats\.uri/.test(code)) {
    helpersUsage.usesFormats = true;
    helpersUsage.usesUri = true;
    code = code.replace(
      /const \w+ = require\("ajv-formats\/dist\/formats"\)\.fullFormats\.uri;/g,
      'const format0 = formatUri;',
    );
  }
  if (/fullFormats\["date-time"]/.test(code)) {
    helpersUsage.usesFormats = true;
    helpersUsage.usesDateTime = true;
    code = code.replace(
      /const \w+ = require\("ajv-formats\/dist\/formats"\)\.fullFormats\["date-time"];/g,
      'const format1 = formatDateTime;',
    );
  }
  if (/require\("ajv\/dist\/runtime\/ucs2length"\)/.test(code)) {
    helpersUsage.usesUnicodeLength = true;
    code = code.replace(
      /const \w+ = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/g,
      'const unicodeFn = unicodeLength;',
    );
  }

  code = code.trim();
  code = code.replace(/;/g, ';\n');
  code = code.replace(/}([a-zA-Z])/g, '}\n$1');
  code = code.replace(/}(\s*)else/g, '}\nelse');
  code = code.replace(/\n{2,}/g, '\n');

  const body = code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `  ${line}`)
    .join('\n');

  return {
    exportedName: exportMatch[1],
    body,
    helpers: helpersUsage,
  };
}

function ensureTypeName(schema, schemaPath) {
  if (schema.title && typeof schema.title === 'string') {
    return schema.title.replace(/\W+/g, '');
  }
  const fileName = path.basename(schemaPath, '.schema.json');
  return toPascalCase(fileName);
}

function toSchemaConstName(typeName) {
  return `${typeName.charAt(0).toLowerCase()}${typeName.slice(1)}Schema`;
}

function toPascalCase(value) {
  return value
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

class TypeGenerator {
  constructor(schemaStore) {
    this.schemaStore = schemaStore;
    this.typeCache = new Map();
    this.declarations = [];
    this.processing = new Set();
  }

  emitAll() {
    const chunks = [];
    for (const { path: schemaPath, json } of this.schemaStore.values()) {
      const typeName = ensureTypeName(json, schemaPath);
      this.generateForPointer(schemaPath, '', typeName);
    }
    for (const decl of this.declarations) {
      chunks.push(decl);
    }
    return chunks.join('\n\n');
  }

  generateForPointer(schemaPath, pointer, preferredName) {
    const key = `${schemaPath}#${pointer}`;
    if (this.typeCache.has(key)) {
      return this.typeCache.get(key);
    }
    if (this.processing.has(key)) {
      return preferredName;
    }

    this.processing.add(key);
    const schema = this.resolvePointer(schemaPath, pointer);
    const typeName = preferredName ?? this.deriveTypeName(schemaPath, pointer, schema);

    const declaration = this.renderDeclaration(schemaPath, pointer, schema, typeName);
    if (declaration) {
      this.declarations.push(declaration);
    }

    this.typeCache.set(key, typeName);
    this.processing.delete(key);
    return typeName;
  }

  renderDeclaration(schemaPath, pointer, schema, typeName) {
    const typeBody = this.schemaToType(schemaPath, pointer, schema, typeName);
    if (!typeBody) {
      return '';
    }
    if (schema.type === 'object' && !schema.allOf && !schema.anyOf && !schema.oneOf && !schema.enum && !schema.const) {
      return `export interface ${typeName} ${typeBody}`;
    }
    return `export type ${typeName} = ${typeBody};`;
  }

  schemaToType(schemaPath, pointer, schema, typeNameHint) {
    if (schema.const !== undefined) {
      return JSON.stringify(schema.const);
    }
    if (Array.isArray(schema.enum)) {
      return schema.enum.map((item) => JSON.stringify(item)).join(' | ') || 'never';
    }
    if (schema.allOf) {
      return schema.allOf
        .map((sub, index) => this.inlineType(schemaPath, `${pointer}/allOf/${index}`, sub, `${typeNameHint}AllOf${index + 1}`))
        .join(' & ');
    }
    if (schema.anyOf) {
      return schema.anyOf
        .map((sub, index) => this.inlineType(schemaPath, `${pointer}/anyOf/${index}`, sub, `${typeNameHint}AnyOf${index + 1}`))
        .join(' | ');
    }
    if (schema.oneOf) {
      return schema.oneOf
        .map((sub, index) => this.inlineType(schemaPath, `${pointer}/oneOf/${index}`, sub, `${typeNameHint}OneOf${index + 1}`))
        .join(' | ');
    }
    if (schema.$ref) {
      return this.resolveRef(schemaPath, schema.$ref);
    }
    switch (schema.type) {
      case 'object':
        return this.renderObject(schemaPath, pointer, schema, typeNameHint);
      case 'array': {
        const itemsSchema = schema.items ?? {};
        const arrayType = this.inlineType(schemaPath, `${pointer}/items`, itemsSchema, `${typeNameHint}Item`);
        return `Array<${arrayType}>`;
      }
      case 'string':
        return 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'null':
        return 'null';
      default:
        return 'unknown';
    }
  }

  inlineType(schemaPath, pointer, schema, fallbackName) {
    if (schema && typeof schema === 'object' && '$ref' in schema && schema.$ref) {
      return this.resolveRef(schemaPath, schema.$ref);
    }
    if (this.shouldMaterialiseType(schema) && pointer) {
      return this.generateForPointer(schemaPath, pointer, fallbackName);
    }
    return this.schemaToType(schemaPath, pointer, schema, fallbackName);
  }

  renderObject(schemaPath, pointer, schema, typeNameHint) {
    const required = new Set(schema.required ?? []);
    const lines = [];
    const properties = schema.properties ?? {};
    for (const [propName, propSchema] of Object.entries(properties)) {
      const propPointer = `${pointer}/properties/${escapeJsonPointer(propName)}`;
      const propType = this.inlineType(schemaPath, propPointer, propSchema, `${typeNameHint}${toPascalCase(propName)}`);
      const optional = required.has(propName) ? '' : '?';
      lines.push(`  ${JSON.stringify(propName)}${optional}: ${propType};`);
    }
    const patternProperties = schema.patternProperties ?? {};
    if (schema.additionalProperties && schema.additionalProperties !== false) {
      const additionalType = this.inlineType(
        schemaPath,
        `${pointer}/additionalProperties`,
        schema.additionalProperties,
        `${typeNameHint}AdditionalProperty`,
      );
      lines.push(`  [key: string]: ${additionalType};`);
    } else if (Object.keys(patternProperties).length > 0) {
      const patternTypes = Object.entries(patternProperties).map(([pattern, patternSchema]) => {
        const patternPointer = `${pointer}/patternProperties/${escapeJsonPointer(pattern)}`;
        return this.inlineType(schemaPath, patternPointer, patternSchema, `${typeNameHint}Pattern`);
      });
      lines.push(`  [key: string]: ${patternTypes.join(' | ')};`);
    } else if (Object.keys(properties).length === 0) {
      lines.push('  [key: string]: never;');
    }
    return `{\n${lines.join('\n')}\n}`;
  }

  resolveRef(schemaPath, ref) {
    const targetPath = schemaPathForRef(schemaPath, ref);
    const pointer = pointerFromRef(ref);
    const schema = this.resolvePointer(targetPath, pointer);
    const typeName = this.generateForPointer(targetPath, pointer, this.deriveTypeName(targetPath, pointer, schema));
    return typeName;
  }

  deriveTypeName(schemaPath, pointer, schema) {
    const baseSchema = this.schemaStore.get(schemaPath)?.json;
    const baseTitle = baseSchema?.title ? baseSchema.title : toPascalCase(path.basename(schemaPath, '.schema.json'));
    if (!pointer || pointer === '') {
      return ensureTypeName(schema, schemaPath);
    }
    const segments = pointer
      .split('/')
      .filter(Boolean)
      .filter((segment) => !['properties', 'definitions', 'items', 'allOf', 'anyOf', 'oneOf', 'additionalProperties'].includes(segment))
      .map((segment) => toPascalCase(segment));
    if (segments.length === 0) {
      return `${baseTitle}Nested`;
    }
    return `${baseTitle}${segments.join('')}`;
  }

  resolvePointer(schemaPath, pointer) {
    const record = this.schemaStore.get(schemaPath);
    if (!record) {
      throw new Error(`Не найдена схема по пути ${schemaPath}`);
    }
    if (!pointer) {
      return record.json;
    }
    const segments = pointer.split('/').filter(Boolean).map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = record.json;
    for (const segment of segments) {
      current = current?.[segment];
      if (current === undefined) {
        throw new Error(`Некорректный JSON Pointer "${pointer}" в схеме ${schemaPath}`);
      }
    }
    return current;
  }

  shouldMaterialiseType(schema) {
    if (!schema || typeof schema !== 'object') {
      return false;
    }
    if (schema.const !== undefined || schema.enum || schema.allOf || schema.anyOf || schema.oneOf) {
      return true;
    }
    if (schema.type === 'object') {
      return true;
    }
    if (schema.type === 'array') {
      return schema.items && typeof schema.items === 'object';
    }
    return false;
  }
}

function schemaPathForRef(currentPath, ref) {
  if (!ref || !ref.includes('#')) {
    return currentPath;
  }
  const [refPath] = ref.split('#');
  if (!refPath) {
    return currentPath;
  }
  const absolute = path.isAbsolute(refPath) ? refPath : path.resolve(path.dirname(currentPath), refPath);
  return absolute;
}

function pointerFromRef(ref) {
  if (!ref) {
    return '';
  }
  const [, pointer = ''] = ref.split('#');
  return pointer;
}

function escapeJsonPointer(segment) {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
