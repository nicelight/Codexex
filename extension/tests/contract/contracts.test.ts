import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import {
  type AggregatedTabsState,
  type ContentScriptHeartbeat,
  type ContentScriptTasksUpdate,
  resetContractValidationState,
} from '@/shared/contracts';
import { createMockChrome, setChromeInstance, type ChromeMock } from '@/shared/chrome';
import { getSessionStateKey } from '@/shared/storage';
import { initializeAggregator } from '@/background/aggregator';
import { generatePopupRenderState } from '@/background/popup-state';
import { startTestHttpAdapter } from '../support/http-adapter';

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONTRACTS_DIR = path.join(ROOT_DIR, '..', '..', 'contracts');

async function loadSchema(relativePath: string): Promise<unknown> {
  const absolute = path.join(CONTRACTS_DIR, relativePath);
  const content = await readFile(absolute, 'utf-8');
  return JSON.parse(content) as unknown;
}

describe('JSON schema contracts', () => {
  let chromeMock: ChromeMock;

  beforeEach(() => {
    chromeMock = createMockChrome({
      i18n: { getUILanguage: () => 'en' },
    });
    setChromeInstance(chromeMock);
    resetContractValidationState();
  });

  afterEach(() => {
    setChromeInstance(undefined);
  });

  it('validates ContentScriptTasksUpdate payloads', async () => {
    const schema = await loadSchema('dto/content-update.schema.json');
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile<ContentScriptTasksUpdate>(schema);

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
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile<AggregatedTabsState>(schema);

    const aggregator = initializeAggregator({ chrome: chromeMock });
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
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const aggregator = initializeAggregator({ chrome: chromeMock });
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
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile<ContentScriptHeartbeat>(schema);

    const heartbeat: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: 'https://codex.openai.com/tab',
      ts: 2_000,
      lastUpdateTs: 1_500,
      intervalMs: 15_000,
    };
    expect(validate(heartbeat)).toBe(true);

    const aggregator = initializeAggregator({ chrome: chromeMock });
    await aggregator.ready;
    await aggregator.handleHeartbeat(heartbeat, {
      tab: { id: 4, title: 'Heartbeat tab', url: heartbeat.origin },
    } as chrome.runtime.MessageSender);

    const stored = await chromeMock.storage.session.get(getSessionStateKey());
    expect(stored[getSessionStateKey()]).toBeDefined();
  });
});

describe('OpenAPI adapter contracts', () => {
  let chromeMock: ChromeMock;
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);

  beforeEach(() => {
    chromeMock = createMockChrome({
      i18n: { getUILanguage: () => 'ru-RU' },
    });
    setChromeInstance(chromeMock);
    resetContractValidationState();
  });

  afterEach(() => {
    setChromeInstance(undefined);
  });

  it('serves responses matching OpenAPI schemas', async () => {
    const aggregator = initializeAggregator({ chrome: chromeMock });
    await aggregator.ready;

    const adapter = await startTestHttpAdapter({
      aggregator,
      chrome: chromeMock,
      tabId: 21,
      tabTitle: 'Codex QA',
    });

    try {
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
          { detector: 'D2_STOP_BUTTON', evidence: 'Остановить', taskKey: 'ru:stop' },
        ],
        ts: 1_100,
      };

      let response = await fetch(`${adapter.url}/background/tasks-update`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update),
      });
      expect(response.status).toBe(202);

      response = await fetch(`${adapter.url}/background/tasks-heartbeat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(heartbeat),
      });
      expect(response.status).toBe(202);

      response = await fetch(`${adapter.url}/background/state`);
      expect(response.status).toBe(200);
      const aggregated = (await response.json()) as AggregatedTabsState;
      expect(ajv.validate(await loadSchema('state/aggregated-state.schema.json'), aggregated)).toBe(true);

      response = await fetch(`${adapter.url}/popup/state`);
      expect(response.status).toBe(200);
      const popupState = await response.json();
      expect(ajv.validate(await loadSchema('dto/popup-state.schema.json'), popupState)).toBe(true);
      expect(popupState.messages.title).toBe('Наблюдатель задач Codex');
    } finally {
      await adapter.close();
    }
  });

  it('rejects invalid payloads with descriptive errors', async () => {
    const aggregator = initializeAggregator({ chrome: chromeMock });
    await aggregator.ready;

    const adapter = await startTestHttpAdapter({
      aggregator,
      chrome: chromeMock,
      tabId: 1,
      tabTitle: 'Codex QA',
    });

    try {
      const response = await fetch(`${adapter.url}/background/tasks-update`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'TASKS_UPDATE' }),
      });
      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload.status).toBe('invalid');
      expect(Array.isArray(payload.errors)).toBe(true);
    } finally {
      await adapter.close();
    }
  });
});
