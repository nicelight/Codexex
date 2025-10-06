import { describe, expect, it, vi } from 'vitest';
import type {
  ContentScriptHeartbeat,
  ContentScriptTasksUpdate,
} from '../../../src/shared/contracts';
import type { BackgroundAggregator } from '../../../src/background/aggregator';
import { handleRuntimeMessage } from '../../../src/background/index';

function createAggregatorMock(): BackgroundAggregator {
  return {
    ready: Promise.resolve(),
    onStateChange: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(async () => ({ tabs: {}, lastTotal: 0, debounce: { ms: 12_000, since: 0 } })),
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
      origin: 'https://codex.openai.com',
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
      origin: 'https://codex.openai.com',
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
});
