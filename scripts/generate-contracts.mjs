#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const contractsDir = path.join(rootDir, 'contracts');
const outputFile = path.join(rootDir, 'extension/src/shared/contracts.ts');

async function main() {
  const schemaFiles = await collectSchemaFiles(contractsDir);
  if (schemaFiles.length === 0) {
    throw new Error(`Не найдены JSON Schema в каталоге ${contractsDir}`);
  }

  const sortedSchemas = schemaFiles.sort((a, b) => a.localeCompare(b));

  const typeChunks = [];
  const schemaChunks = [];
  const schemaVarNames = [];
  const validatorChunks = [];
  const resetAssignments = [];
  const registryEntries = [];

  for (const schemaPath of sortedSchemas) {
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    const schemaJson = JSON.parse(schemaContent);
    const typeName = schemaJson.title;
    if (!typeName || typeof typeName !== 'string') {
      throw new Error(`Схема ${schemaPath} не содержит строкового поля title`);
    }

    const compiled = await compileFromFile(schemaPath, {
      cwd: contractsDir,
      bannerComment: '',
      style: {
        singleQuote: true,
      },
    });

    const normalizedType = compiled.trim();
    typeChunks.push(normalizedType.endsWith('\n') ? normalizedType : `${normalizedType}\n`);

    const schemaVarName = toSchemaConstName(typeName);
    const validatorVarName = `validate${typeName}Fn`;
    const validateFunctionName = `validate${typeName}`;
    const assertFunctionName = `assert${typeName}`;

    schemaChunks.push(`export const ${schemaVarName} = ${schemaContent.trim()} as const;\n`);
    schemaVarNames.push(schemaVarName);

    validatorChunks.push(`let ${validatorVarName}: ValidateFunction<${typeName}> | undefined;\n`);
    validatorChunks.push(`export function ${validateFunctionName}(value: unknown): value is ${typeName} {\n`);
    validatorChunks.push(`  if (!${validatorVarName}) {\n`);
    validatorChunks.push(`    ${validatorVarName} = getAjv().compile<${typeName}>(${schemaVarName});\n`);
    validatorChunks.push('  }\n');
    validatorChunks.push(`  return (${validatorVarName}(value) as boolean);\n`);
    validatorChunks.push('}\n');
    validatorChunks.push(`export function ${assertFunctionName}(value: unknown): asserts value is ${typeName} {\n`);
    validatorChunks.push(`  if (!${validateFunctionName}(value)) {\n`);
    validatorChunks.push(
      `    throw new ContractValidationError('${typeName}', ${validatorVarName}?.errors ?? []);\n`,
    );
    validatorChunks.push('  }\n');
    validatorChunks.push('}\n');

    resetAssignments.push(`  ${validatorVarName} = undefined;`);
    registryEntries.push(
      `  '${typeName}': { schema: ${schemaVarName}, validate: ${validateFunctionName}, assert: ${assertFunctionName} },`,
    );
  }

  const schemaArray = `const allSchemas = [${schemaVarNames.join(', ')}] as const;`;
  const registerHelper = `let schemasRegistered = false;\n\nfunction registerSchemas(ajv: Ajv): void {\n  if (schemasRegistered) {\n    return;\n  }\n  for (const schema of allSchemas) {\n    ajv.addSchema(schema);\n  }\n  schemasRegistered = true;\n}`;

  const fileContent = `/* eslint-disable */\n/**\n * Автогенерируемый модуль. Не редактируйте вручную.\n * Скрипт генерации: scripts/generate-contracts.mjs\n */\n\nimport Ajv, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';\nimport addFormats from 'ajv-formats';\n\nexport interface ContractDescriptor<T> {\n  readonly schema: unknown;\n  readonly validate: (value: unknown) => value is T;\n  readonly assert: (value: unknown) => asserts value is T;\n}\n\nexport class ContractValidationError extends Error {\n  public readonly errors: ErrorObject[];\n\n  constructor(public readonly typeName: string, errors: ErrorObject[] = []) {\n    super(\`Validation failed for contract "\${typeName}"\`);\n    this.name = 'ContractValidationError';\n    this.errors = errors;\n  }\n}\n\nlet ajvInstance: Ajv | undefined;\n\nfunction createAjv(): Ajv {\n  const ajv = new Ajv({\n    strict: true,\n    allErrors: true,\n    allowUnionTypes: true,\n  });\n  addFormats(ajv);\n  registerSchemas(ajv);\n  return ajv;\n}\n\nfunction getAjv(): Ajv {\n  if (!ajvInstance) {\n    ajvInstance = createAjv();\n  }\n  return ajvInstance;\n}\n\nexport function resetContractValidationState(): void {\n  ajvInstance = undefined;\n${resetAssignments.join('\n')}\n}\n\n${typeChunks.join('\n')}\n${schemaChunks.join('\n')}\n${schemaArray}\n\n${registerHelper}\n\n${validatorChunks.join('\n')}\nexport const contractRegistry = {\n${registryEntries.join('\n')}\n} as const;\n\ntype ExtractAssertedType<T> = T extends (value: unknown) => asserts value is infer R ? R : never;\nexport type ContractType = keyof typeof contractRegistry;\n\nexport function getContractDescriptor<T extends ContractType>(type: T): ContractDescriptor<ExtractAssertedType<(typeof contractRegistry)[T]['assert']>> {\n  return contractRegistry[type] as ContractDescriptor<ExtractAssertedType<(typeof contractRegistry)[T]['assert']>>;\n}\n`;

  await fs.writeFile(outputFile, fileContent, 'utf-8');
}

async function collectSchemaFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await collectSchemaFiles(path.join(dir, entry.name));
      files.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.schema.json')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function toSchemaConstName(typeName) {
  return `${typeName.charAt(0).toLowerCase()}${typeName.slice(1)}Schema`;
}

await main();
