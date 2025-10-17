import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';

import {
  assertAggregatedTabsState,
  assertContentScriptHeartbeat,
  assertContentScriptTasksUpdate,
  type AggregatedTabsState,
  type ContentScriptHeartbeat,
  type ContentScriptTasksUpdate,
  resetContractValidationState,
  registerContractSchemas,
} from '@/shared/contracts';
import type { ChromeMock } from '@/shared/chrome';
import { getSessionStateKey } from '@/shared/storage';
import { initializeAggregator, type BackgroundAggregator } from '@/background/aggregator';
import { initializeSettingsController } from '@/background/settings-controller';
import { generatePopupRenderState } from '@/background/popup-state';
import {
  type ChromeTestEnvironment,
  flushMicrotasks,
  setupChromeTestEnvironment,
} from '../support/environment';

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function createAjvInstance(): Ajv {
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  registerContractSchemas(ajv);
  return ajv;
}

type JsonSchema = { $id?: string } & Record<string, unknown>;

function compileSchema<Data>(
  ajv: Ajv,
  schema: JsonSchema,
): ValidateFunction<Data> {
  const schemaId = schema.$id;
  if (schemaId) {
    const existing = ajv.getSchema(schemaId);
    if (existing) {
      return existing as ValidateFunction<Data>;
    }
  }
  return ajv.compile(schema) as ValidateFunction<Data>;
}

const CONTRACTS_DIR = path.join(ROOT_DIR, '..', '..', 'contracts');

async function loadSchema(relativePath: string): Promise<JsonSchema> {
  const absolute = path.join(CONTRACTS_DIR, relativePath);
  const content = await readFile(absolute, 'utf-8');
  return JSON.parse(content) as JsonSchema;
}

function createAggregator(chromeMock: ChromeMock): BackgroundAggregator {
  const settings = initializeSettingsController({ chrome: chromeMock });
  return initializeAggregator({ chrome: chromeMock, settings });
}

const BASE_URL = 'http://localhost';

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  server.resetHandlers();
});

interface BackgroundHttpOptions {
  readonly aggregator: BackgroundAggregator;
  readonly chrome: ChromeMock;
  readonly tabId: number;
  readonly tabTitle: string;
  readonly tabUrl?: string;
}

function useBackgroundHttpHandlers(options: BackgroundHttpOptions): void {
  const { aggregator, chrome, tabId, tabTitle, tabUrl = 'https://codex.openai.com' } = options;

  server.use(
    rest.post(`${BASE_URL}/background/tasks-update`, async (req, res, ctx) => {
      try {
        const payload = await req.json<ContentScriptTasksUpdate>();
        assertContentScriptTasksUpdate(payload);
        await aggregator.handleTasksUpdate(payload, {
          tab: { id: tabId, title: tabTitle, url: tabUrl },
        } as chrome.runtime.MessageSender);
        return res(ctx.status(202), ctx.json({ status: 'accepted' }));
      } catch (error) {
        if (error && typeof error === 'object' && 'errors' in error) {
          return res(
            ctx.status(400),
            ctx.json({ status: 'invalid', errors: (error as { errors?: unknown }).errors }),
          );
        }
        return res(
          ctx.status(500),
          ctx.json({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }),
    rest.post(`${BASE_URL}/background/tasks-heartbeat`, async (req, res, ctx) => {
      try {
        const payload = await req.json<ContentScriptHeartbeat>();
        assertContentScriptHeartbeat(payload);
        await aggregator.handleHeartbeat(payload, {
          tab: { id: tabId, title: tabTitle, url: tabUrl },
        } as chrome.runtime.MessageSender);
        return res(ctx.status(202), ctx.json({ status: 'accepted' }));
      } catch (error) {
        if (error && typeof error === 'object' && 'errors' in error) {
          return res(
            ctx.status(400),
            ctx.json({ status: 'invalid', errors: (error as { errors?: unknown }).errors }),
          );
        }
        return res(
          ctx.status(500),
          ctx.json({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }),
    rest.get(`${BASE_URL}/background/state`, async (_req, res, ctx) => {
      try {
        const snapshot = await aggregator.getSnapshot();
        assertAggregatedTabsState(snapshot);
        return res(ctx.status(200), ctx.json(snapshot));
      } catch (error) {
        if (error && typeof error === 'object' && 'errors' in error) {
          return res(
            ctx.status(400),
            ctx.json({ status: 'invalid', errors: (error as { errors?: unknown }).errors }),
          );
        }
        return res(
          ctx.status(500),
          ctx.json({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }),
    rest.get(`${BASE_URL}/popup/state`, async (_req, res, ctx) => {
      try {
        const state = await generatePopupRenderState(aggregator, { chrome });
        return res(ctx.status(200), ctx.json(state));
      } catch (error) {
        if (error && typeof error === 'object' && 'errors' in error) {
          return res(
            ctx.status(400),
            ctx.json({ status: 'invalid', errors: (error as { errors?: unknown }).errors }),
          );
        }
        return res(
          ctx.status(500),
          ctx.json({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }),
  );
}

describe('JSON schema contracts', () => {
  let chromeMock: ChromeMock;
  let env: ChromeTestEnvironment;

  beforeEach(() => {
    env = setupChromeTestEnvironment({
      overrides: {
        i18n: { getUILanguage: () => 'en' },
      },
    });
    chromeMock = env.chrome;
    resetContractValidationState();
  });

  afterEach(() => {
    env.restore();
  });

  it('validates ContentScriptTasksUpdate payloads', async () => {
    const schema = await loadSchema('dto/content-update.schema.json');
    const ajv = createAjvInstance();
    const validate = compileSchema<ContentScriptTasksUpdate>(ajv, schema);

    const valid: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://codex.openai.com/tab',
      active: true,
      count: 2,
      signals: [
        { detector: 'D1_SPINNER', evidence: 'Spinner detected' },
        { detector: 'D2_STOP_BUTTON', evidence: 'Stop button visible', taskKey: 'stop:1' },
      ],
      ts: Date.now(),
    };
    expect(validate(valid)).toBe(true);

    const invalid = {
      type: 'TASKS_UPDATE',
      active: 'yes',
      count: -1,
    } as unknown;
    expect(validate(invalid)).toBe(false);
    expect(validate.errors).toBeDefined();
  });

  it('validates AggregatedTabsState snapshots from the aggregator', async () => {
    const schema = await loadSchema('state/aggregated-state.schema.json');
    const ajv = createAjvInstance();
    const validate = compileSchema<AggregatedTabsState>(ajv, schema);

    const aggregator = createAggregator(chromeMock);
    await aggregator.ready;

    const update: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://codex.openai.com/work',
      active: true,
      count: 1,
      signals: [{ detector: 'D1_SPINNER', evidence: 'Spinner detected' }],
      ts: 1_000,
    };
    await aggregator.handleTasksUpdate(update, {
      tab: { id: 17, title: 'Work tab', url: update.origin },
    } as chrome.runtime.MessageSender);

    const snapshot = await aggregator.getSnapshot();
    expect(validate(snapshot)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('validates popup render state against schema', async () => {
    const schema = await loadSchema('dto/popup-state.schema.json');
    const ajv = createAjvInstance();
    const validate = compileSchema(ajv, schema);

    const aggregator = createAggregator(chromeMock);
    await aggregator.ready;

    const update: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://codex.openai.com/tab',
      active: true,
      count: 3,
      signals: [
        { detector: 'D2_STOP_BUTTON', evidence: 'Stop button', taskKey: 'stop:42' },
      ],
      ts: 5_000,
    };
    await aggregator.handleTasksUpdate(update, {
      tab: { id: 9, title: 'Codex tasks', url: update.origin },
    } as chrome.runtime.MessageSender);

    const popupState = await generatePopupRenderState(aggregator, { chrome: chromeMock });
    expect(validate(popupState)).toBe(true);
  });

  it('validates heartbeat payloads and storage defaults', async () => {
    const schema = await loadSchema('dto/content-heartbeat.schema.json');
    const ajv = createAjvInstance();
    const validate = compileSchema<ContentScriptHeartbeat>(ajv, schema);

    const heartbeat: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: 'https://codex.openai.com/tab',
      ts: 2_000,
      lastUpdateTs: 1_500,
      intervalMs: 15_000,
    };
    expect(validate(heartbeat)).toBe(true);

    const aggregator = createAggregator(chromeMock);
    await aggregator.ready;
    await aggregator.handleHeartbeat(heartbeat, {
      tab: { id: 4, title: 'Heartbeat tab', url: heartbeat.origin },
    } as chrome.runtime.MessageSender);

    await flushMicrotasks();
    const stored = await chromeMock.storage.session.get(getSessionStateKey());
    expect(stored[getSessionStateKey()]).toBeDefined();
  });
});

describe('OpenAPI adapter contracts', () => {
  let chromeMock: ChromeMock;
  let env: ChromeTestEnvironment;
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  registerContractSchemas(ajv);

  beforeEach(() => {
    env = setupChromeTestEnvironment({
      overrides: {
        i18n: { getUILanguage: () => 'ru-RU' },
      },
    });
    chromeMock = env.chrome;
    resetContractValidationState();
  });

  afterEach(() => {
    env.restore();
  });

  it('serves responses matching OpenAPI schemas', async () => {
    const aggregator = createAggregator(chromeMock);
    await aggregator.ready;

    useBackgroundHttpHandlers({
      aggregator,
      chrome: chromeMock,
      tabId: 21,
      tabTitle: 'Codex QA',
    });

    const heartbeat: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: 'https://codex.openai.com/cases',
      ts: 1_000,
      lastUpdateTs: 800,
      intervalMs: 12_000,
    };
    const update: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: heartbeat.origin,
      active: true,
      count: 1,
      signals: [
        { detector: 'D2_STOP_BUTTON', evidence: 'Стоп', taskKey: 'ru:stop' },
      ],
      ts: 1_100,
    };

    const ajvInstance = createAjvInstance();

    let response = await fetch(`${BASE_URL}/background/tasks-update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    });
    expect(response.status).toBe(202);

    response = await fetch(`${BASE_URL}/background/tasks-heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(heartbeat),
    });
    expect(response.status).toBe(202);

    response = await fetch(`${BASE_URL}/background/state`);
    expect(response.status).toBe(200);
    const aggregatedSchema = await loadSchema('state/aggregated-state.schema.json');
    const aggregatedValidator = compileSchema<AggregatedTabsState>(ajvInstance, aggregatedSchema);
    const aggregated = (await response.json()) as AggregatedTabsState;
    expect(aggregatedValidator(aggregated)).toBe(true);

    response = await fetch(`${BASE_URL}/popup/state`);
    expect(response.status).toBe(200);
    const popupSchema = await loadSchema('dto/popup-state.schema.json');
    const popupValidator = compileSchema(ajvInstance, popupSchema);
    const popupState = await response.json();
    expect(popupValidator(popupState)).toBe(true);
    expect(typeof popupState.messages.title).toBe('string');
  });

  it('rejects invalid payloads with descriptive errors', async () => {
    const aggregator = createAggregator(chromeMock);
    await aggregator.ready;

    useBackgroundHttpHandlers({
      aggregator,
      chrome: chromeMock,
      tabId: 1,
      tabTitle: 'Codex QA',
    });

    let response = await fetch(`${BASE_URL}/background/tasks-update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'TASKS_UPDATE' }),
    });
    expect(response.status).toBe(400);
    const invalidUpdate = await response.json();
    expect(invalidUpdate.status).toBe('invalid');
    expect(Array.isArray(invalidUpdate.errors)).toBe(true);

    response = await fetch(`${BASE_URL}/background/tasks-heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'TASKS_HEARTBEAT' }),
    });
    expect(response.status).toBe(400);
    const invalidHeartbeat = await response.json();
    expect(invalidHeartbeat.status).toBe('invalid');
    expect(Array.isArray(invalidHeartbeat.errors)).toBe(true);
  });
});






