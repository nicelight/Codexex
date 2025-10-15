import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AggregatedTabsState,
  ContentScriptHeartbeat,
  ContentScriptTasksUpdate,
} from '../../../src/shared/contracts';
import type { BackgroundAggregator } from '../../../src/background/aggregator';
import {
  createMockChrome,
  setChromeInstance,
  type ChromeMock,
} from '../../../src/shared/chrome';

let chromeMock: ChromeMock;
let handleRuntimeMessage: typeof import('../../../src/background/index')['handleRuntimeMessage'];

beforeEach(async () => {
  vi.resetModules();
  chromeMock = createMockChrome();
  setChromeInstance(chromeMock);
  ({ handleRuntimeMessage } = await import('../../../src/background/index'));
});

afterEach(() => {
  setChromeInstance(undefined);
  vi.restoreAllMocks();
});

function createAggregatorMock(snapshot?: AggregatedTabsState): BackgroundAggregator {
  return {
    ready: Promise.resolve(),
    onStateChange: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(async () =>
      snapshot ?? {
        tabs: {},
        lastTotal: 0,
        debounce: { ms: 12_000, since: 0 },
      },
    ),
    getTrackedTabIds: vi.fn(async () => []),
    handleTasksUpdate: vi.fn(async () => undefined),
    handleHeartbeat: vi.fn(async () => undefined),
    handleTabRemoved: vi.fn(async () => undefined),
    evaluateHeartbeatStatuses: vi.fn(async () => []),
    clearDebounceIfIdle: vi.fn(async () => false),
  };
}

function createLoggerMock() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('background message handler', () => {
  it('routes TASKS_UPDATE to the aggregator', async () => {
    const aggregator = createAggregatorMock();
    const logger = createLoggerMock();
    const message: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: true,
      count: 1,
      signals: [],
      ts: 100,
    };
    const sender = { tab: { id: 1 } } as chrome.runtime.MessageSender;

    await handleRuntimeMessage(aggregator, logger, message, sender);
    expect(aggregator.handleTasksUpdate).toHaveBeenCalledWith(message, sender);
  });

  it('routes TASKS_HEARTBEAT to the aggregator', async () => {
    const aggregator = createAggregatorMock();
    const logger = createLoggerMock();
    const message: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: 'https://chatgpt.com/codex',
      ts: 200,
      lastUpdateTs: 150,
      intervalMs: 15_000,
    };
    const sender = { tab: { id: 2 } } as chrome.runtime.MessageSender;

    await handleRuntimeMessage(aggregator, logger, message, sender);
    expect(aggregator.handleHeartbeat).toHaveBeenCalledWith(message, sender);
  });

  it('ignores invalid payloads', async () => {
    const aggregator = createAggregatorMock();
    const logger = createLoggerMock();
    const badMessage = { type: 'TASKS_UPDATE' };
    const sender = { tab: { id: 3 } } as chrome.runtime.MessageSender;

    await handleRuntimeMessage(aggregator, logger, badMessage, sender);
    expect(aggregator.handleTasksUpdate).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns popup render state for POPUP_GET_STATE messages', async () => {
    const snapshot: AggregatedTabsState = {
      tabs: {
        '5': {
          origin: 'https://chatgpt.com/codex',
          title: 'Codex Tasks',
          count: 2,
          active: true,
          updatedAt: 1_000,
          lastSeenAt: 1_000,
          heartbeat: {
            lastReceivedAt: 1_000,
            expectedIntervalMs: 15_000,
            status: 'OK',
            missedCount: 0,
          },
          signals: [
            {
              detector: 'D1_SPINNER',
              evidence: 'Spinner visible',
            },
          ],
        },
      },
      lastTotal: 2,
      debounce: { ms: 12_000, since: 0 },
    };
    const aggregator = createAggregatorMock(snapshot);
    const logger = createLoggerMock();

    const response = await handleRuntimeMessage(
      aggregator,
      logger,
      { type: 'POPUP_GET_STATE' },
      { tab: undefined } as chrome.runtime.MessageSender,
    );

    expect(aggregator.getSnapshot).toHaveBeenCalled();
    expect(response).toMatchObject({
      totalActive: 2,
      tabs: [
        {
          tabId: 5,
          count: 2,
          title: 'Codex Tasks',
        },
      ],
    });
  });

  it('reacts to verbose flag changes stored in session storage', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await chromeMock.storage.session.set({ 'codex.tasks.verbose': true });
    expect(hasVerboseLog(infoSpy.mock.calls, true)).toBe(true);

    infoSpy.mockClear();
    await chromeMock.storage.session.set({ 'codex.tasks.verbose': false });
    expect(hasVerboseLog(infoSpy.mock.calls, false)).toBe(true);
  });
});

function hasVerboseLog(calls: unknown[][], expected: boolean): boolean {
  return calls.some((call) => {
    const hasMessage = call.some((arg) => arg === 'verbose flag toggled');
    const hasPayload = call.some((arg) =>
      typeof arg === 'object' &&
      arg !== null &&
      'verbose' in (arg as Record<string, unknown>) &&
      (arg as Record<string, unknown>).verbose === expected,
    );
    return hasMessage && hasPayload;
  });
}
