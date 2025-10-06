import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  type ContentScriptHeartbeat,
  type ContentScriptTasksUpdate,
} from '../../../src/shared/contracts';
import {
  createMockChrome,
  setChromeInstance,
  type ChromeMock,
} from '../../../src/shared/chrome';
import { getSessionStateKey } from '../../../src/shared/storage';
import { initializeAggregator } from '../../../src/background/aggregator';

describe('BackgroundAggregator', () => {
  let chromeMock: ChromeMock;

  beforeEach(() => {
    chromeMock = createMockChrome();
    setChromeInstance(chromeMock);
  });

  afterEach(() => {
    setChromeInstance(undefined);
  });

  it('persists TASKS_UPDATE payloads and recalculates totals', async () => {
    const aggregator = initializeAggregator({ chrome: chromeMock });
    await aggregator.ready;

    const message: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://codex.openai.com/tab',
      active: true,
      count: 2,
      signals: [
        { detector: 'D2_STOP_BUTTON', evidence: 'Stop button visible', taskKey: 'stop:1' },
        { detector: 'D1_SPINNER', evidence: 'Spinner detected' },
      ],
      ts: 1_000,
    };
    const sender = { tab: { id: 7, title: 'Codex – Tasks' } } as chrome.runtime.MessageSender;

    await aggregator.handleTasksUpdate(message, sender);
    const snapshot = await aggregator.getSnapshot();
    const tabState = snapshot.tabs['7'];
    expect(tabState).toBeDefined();
    expect(tabState.count).toBe(2);
    expect(tabState.active).toBe(true);
    expect(tabState.origin).toBe(message.origin);
    expect(snapshot.lastTotal).toBe(2);
    expect(snapshot.debounce.since).toBe(0);

    const stored = await chromeMock.storage.session.get(getSessionStateKey());
    const storedState = stored[getSessionStateKey()] as unknown;
    expect(storedState).toMatchObject({ lastTotal: 2 });
  });

  it('resets heartbeat status on TASKS_HEARTBEAT', async () => {
    let currentTime = 0;
    const aggregator = initializeAggregator({ chrome: chromeMock, now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 3, title: 'Codex' } } as chrome.runtime.MessageSender;
    const updateMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://codex.openai.com/tab',
      active: false,
      count: 0,
      signals: [],
      ts: 500,
    };
    await aggregator.handleTasksUpdate(updateMessage, sender);

    const heartbeat: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: updateMessage.origin,
      ts: 1_000,
      lastUpdateTs: 500,
      intervalMs: 15_000,
    };

    await aggregator.handleHeartbeat(heartbeat, sender);
    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['3'].heartbeat.status).toBe('OK');
    expect(snapshot.tabs['3'].heartbeat.lastReceivedAt).toBe(1_000);
  });

  it('marks tabs as stale after missed heartbeat interval', async () => {
    let currentTime = 0;
    const aggregator = initializeAggregator({ chrome: chromeMock, now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 11, title: 'Codex' } } as chrome.runtime.MessageSender;
    const heartbeat: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: 'https://codex.openai.com',
      ts: 0,
      lastUpdateTs: 0,
      intervalMs: 10_000,
    };
    await aggregator.handleHeartbeat(heartbeat, sender);

    currentTime = 31_000; // 3 * interval + 1s
    const stale = await aggregator.evaluateHeartbeatStatuses();
    expect(stale).toEqual([11]);

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['11'].heartbeat.status).toBe('STALE');
    expect(snapshot.tabs['11'].heartbeat.missedCount).toBeGreaterThanOrEqual(1);
  });

  it('clears debounce window when state remains idle', async () => {
    let currentTime = 0;
    const aggregator = initializeAggregator({ chrome: chromeMock, now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 9, title: 'Codex' } } as chrome.runtime.MessageSender;
    const activeMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://codex.openai.com/tab',
      active: true,
      count: 1,
      signals: [],
      ts: 1_000,
    };
    await aggregator.handleTasksUpdate(activeMessage, sender);

    currentTime = 2_000;
    const idleMessage: ContentScriptTasksUpdate = { ...activeMessage, active: false, count: 0, ts: 2_000 };
    await aggregator.handleTasksUpdate(idleMessage, sender);

    const preSnapshot = await aggregator.getSnapshot();
    expect(preSnapshot.debounce.since).toBe(2_000);

    const cleared = await aggregator.clearDebounceIfIdle();
    expect(cleared).toBe(true);
    const postSnapshot = await aggregator.getSnapshot();
    expect(postSnapshot.debounce.since).toBe(0);
  });

  it('retries storage writes on transient failures', async () => {
    const originalSet = chromeMock.storage.session.set;
    let attempt = 0;
    chromeMock.storage.session.set = async (items) => {
      attempt += 1;
      if (attempt < 2) {
        throw new Error('transient');
      }
      return originalSet(items);
    };

    const aggregator = initializeAggregator({ chrome: chromeMock });
    await aggregator.ready;

    const message: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://codex.openai.com',
      active: false,
      count: 0,
      signals: [],
      ts: 1_000,
    };
    const sender = { tab: { id: 1, title: 'Codex' } } as chrome.runtime.MessageSender;

    await aggregator.handleTasksUpdate(message, sender);
    expect(attempt).toBe(2);
  });

  it('restores persisted state after reinitialization', async () => {
    const aggregator = initializeAggregator({ chrome: chromeMock });
    await aggregator.ready;

    const message: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://codex.openai.com',
      active: true,
      count: 3,
      signals: [],
      ts: 1_000,
    };
    const sender = { tab: { id: 42, title: 'Codex' } } as chrome.runtime.MessageSender;
    await aggregator.handleTasksUpdate(message, sender);

    const restoredAggregator = initializeAggregator({ chrome: chromeMock });
    await restoredAggregator.ready;
    const snapshot = await restoredAggregator.getSnapshot();
    expect(snapshot.lastTotal).toBe(3);
    expect(snapshot.tabs['42']).toBeDefined();
  });
});
