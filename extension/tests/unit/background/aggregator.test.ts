import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
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
import { initializeSettingsController } from '../../../src/background/settings-controller';
import { SETTINGS_DEFAULTS } from '../../../src/shared/settings';

describe('BackgroundAggregator', () => {
  let chromeMock: ChromeMock;

  beforeEach(() => {
    chromeMock = createMockChrome();
    setChromeInstance(chromeMock);
  });

  afterEach(() => {
    setChromeInstance(undefined);
  });

  function createAggregatorInstance(
    overrides: Partial<Parameters<typeof initializeAggregator>[0]> = {},
  ) {
    const settings = initializeSettingsController({ chrome: chromeMock });
    const aggregator = initializeAggregator({ chrome: chromeMock, ...overrides, settings });
    return { aggregator, settings };
  }

  it('persists TASKS_UPDATE payloads and recalculates totals', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const message: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
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

  it('ignores task updates originating outside the main listing', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const message: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/plan',
      active: true,
      count: 3,
      signals: [
        { detector: 'D2_STOP_BUTTON', evidence: 'Stop button visible', taskKey: 'stop:1' },
      ],
      ts: 500,
    };
    const sender = { tab: { id: 11, title: 'Plan – Tasks' } } as chrome.runtime.MessageSender;

    await aggregator.handleTasksUpdate(message, sender);

    const snapshot = await aggregator.getSnapshot();
    const tabState = snapshot.tabs['11'];
    expect(tabState).toBeUndefined();
    expect(snapshot.lastTotal).toBe(0);
  });

  it('deduplicates counts reported by multiple listing tabs', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const baseMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: true,
      count: 1,
      signals: [
        { detector: 'D2_STOP_BUTTON', evidence: 'Stop button visible', taskKey: 'stop:1' },
      ],
      ts: 1_000,
    };

    const firstSender = { tab: { id: 2, title: 'Codex – Tasks' } } as chrome.runtime.MessageSender;
    await aggregator.handleTasksUpdate(baseMessage, firstSender);

    const secondSender = { tab: { id: 3, title: 'Codex – Tasks' } } as chrome.runtime.MessageSender;
    const secondaryMessage: ContentScriptTasksUpdate = {
      ...baseMessage,
      origin: 'https://chatgpt.com/codex?view=active',
      ts: 1_500,
    };
    await aggregator.handleTasksUpdate(secondaryMessage, secondSender);

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.lastTotal).toBe(1);
    expect(snapshot.tabs['2'].count).toBe(1);
    expect(snapshot.tabs['3'].count).toBe(1);
  });

  it('aggregates totals across distinct listing tabs', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const allTabMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex?tab=all',
      active: true,
      count: 2,
      signals: [
        { detector: 'D1_SPINNER', evidence: 'spinner' },
        { detector: 'D2_STOP_BUTTON', evidence: 'stop-button', taskKey: 'stop:42' },
      ],
      ts: 1_000,
    };
    const allSender = { tab: { id: 4, title: 'Codex – All tasks' } } as chrome.runtime.MessageSender;
    await aggregator.handleTasksUpdate(allTabMessage, allSender);

    const reviewsMessage: ContentScriptTasksUpdate = {
      ...allTabMessage,
      origin: 'https://chatgpt.com/codex?tab=code_reviews',
      count: 3,
      ts: 1_500,
    };
    const reviewSender = { tab: { id: 9, title: 'Codex – Code reviews' } } as chrome.runtime.MessageSender;
    await aggregator.handleTasksUpdate(reviewsMessage, reviewSender);

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.lastTotal).toBe(5);
  });

  it('ignores task detail counters when listing tabs are absent', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const detailMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex/tasks/task_123',
      active: true,
      count: 4,
      signals: [
        { detector: 'D4_TASK_COUNTER', evidence: 'detail-counter' },
      ],
      ts: 1_000,
    };
    const detailSender = { tab: { id: 5, title: 'Codex Task' } } as chrome.runtime.MessageSender;

    await aggregator.handleTasksUpdate(detailMessage, detailSender);

    const secondMessage: ContentScriptTasksUpdate = {
      ...detailMessage,
      origin: 'https://chatgpt.com/codex/tasks/task_999',
      count: 2,
      ts: 1_500,
    };
    const secondSender = { tab: { id: 6, title: 'Codex Task' } } as chrome.runtime.MessageSender;
    await aggregator.handleTasksUpdate(secondMessage, secondSender);

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.lastTotal).toBe(0);
    expect(snapshot.tabs['5']).toBeUndefined();
    expect(snapshot.tabs['6']).toBeUndefined();
  });

  it('prefers Codex root listing totals when both listing and details are present', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const listingMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: true,
      count: 2,
      signals: [
        { detector: 'D2_STOP_BUTTON', evidence: 'stop-button' },
      ],
      ts: 2_000,
    };
    const listingSender = { tab: { id: 7, title: 'Codex – Tasks' } } as chrome.runtime.MessageSender;
    await aggregator.handleTasksUpdate(listingMessage, listingSender);

    const detailMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex/tasks/task_123',
      active: true,
      count: 5,
      signals: [
        { detector: 'D4_TASK_COUNTER', evidence: 'detail-counter' },
      ],
      ts: 2_500,
    };
    const detailSender = { tab: { id: 8, title: 'Codex Task' } } as chrome.runtime.MessageSender;
    await aggregator.handleTasksUpdate(detailMessage, detailSender);

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.lastTotal).toBe(2);
  });

  it('removes tab state when tasks update originates outside Codex', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const sender = { tab: { id: 12, title: 'Codex – Tasks' } } as chrome.runtime.MessageSender;
    const codexMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: true,
      count: 1,
      signals: [
        { detector: 'D2_STOP_BUTTON', evidence: 'Stop button visible', taskKey: 'stop:1' },
      ],
      ts: 1_000,
    };

    await aggregator.handleTasksUpdate(codexMessage, sender);
    expect((await aggregator.getSnapshot()).tabs['12']).toBeDefined();

    const nonCodexMessage: ContentScriptTasksUpdate = {
      ...codexMessage,
      origin: 'https://chatgpt.com/profile',
      active: false,
      count: 0,
      signals: [],
      ts: 2_000,
    };

    await aggregator.handleTasksUpdate(nonCodexMessage, sender);

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['12']).toBeUndefined();
    expect(snapshot.lastTotal).toBe(0);
  });

  it('ignores heartbeats originating outside Codex', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const sender = { tab: { id: 13, title: 'Codex – Tasks' } } as chrome.runtime.MessageSender;
    const codexMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: true,
      count: 1,
      signals: [
        { detector: 'D2_STOP_BUTTON', evidence: 'Stop button visible', taskKey: 'stop:1' },
      ],
      ts: 1_000,
    };

    await aggregator.handleTasksUpdate(codexMessage, sender);
    expect((await aggregator.getSnapshot()).tabs['13']).toBeDefined();

    const nonCodexHeartbeat: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: 'https://chatgpt.com/settings',
      ts: 2_000,
      lastUpdateTs: 2_000,
      intervalMs: 5_000,
    };

    await aggregator.handleHeartbeat(nonCodexHeartbeat, sender);

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['13']).toBeUndefined();
    expect(snapshot.lastTotal).toBe(0);
  });

  it('skips navigation cleanup for untracked tabs without touching storage', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const setSpy = vi.spyOn(chromeMock.storage.session, 'set');
    try {
      await aggregator.handleTabNavigated(42);
      expect(setSpy).not.toHaveBeenCalled();
    } finally {
      setSpy.mockRestore();
    }

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['42']).toBeUndefined();
  });

  it('skips removal cleanup for untracked tabs without touching storage', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const setSpy = vi.spyOn(chromeMock.storage.session, 'set');
    try {
      await aggregator.handleTabRemoved(101);
      expect(setSpy).not.toHaveBeenCalled();
    } finally {
      setSpy.mockRestore();
    }

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['101']).toBeUndefined();
  });

  it('drops tracked tab state on navigation events', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const setSpy = vi.spyOn(chromeMock.storage.session, 'set');
    try {
      const sender = { tab: { id: 88, title: 'Codex – Tasks' } } as chrome.runtime.MessageSender;
      const message: ContentScriptTasksUpdate = {
        type: 'TASKS_UPDATE',
        origin: 'https://chatgpt.com/codex',
        active: true,
        count: 1,
        signals: [
          { detector: 'D2_STOP_BUTTON', evidence: 'stop-button', taskKey: 'stop:1' },
        ],
        ts: 3_000,
      };

      await aggregator.handleTasksUpdate(message, sender);
      expect((await aggregator.getSnapshot()).tabs['88']).toBeDefined();

      setSpy.mockClear();

      await aggregator.handleTabNavigated(88);

      expect(setSpy).toHaveBeenCalledTimes(1);
      const snapshot = await aggregator.getSnapshot();
      expect(snapshot.tabs['88']).toBeUndefined();
    } finally {
      setSpy.mockRestore();
    }
  });

  it('recalculates aggregated total from stored state using canonical rules', async () => {
    const storageKey = getSessionStateKey();
    await chromeMock.storage.session.set({
      [storageKey]: {
        tabs: {
          '10': {
            origin: 'https://chatgpt.com/codex',
            title: 'Codex – Tasks',
            count: 3,
            active: true,
            updatedAt: 1_000,
            lastSeenAt: 1_000,
            heartbeat: {
              lastReceivedAt: 1_000,
              expectedIntervalMs: 5_000,
              status: 'OK',
              missedCount: 0,
            },
            signals: [
              {
                detector: 'D2_STOP_BUTTON',
                evidence: 'stop-button',
                taskKey: 'task-1',
              },
            ],
          },
          '11': {
            origin: 'https://chatgpt.com/codex/tasks/task_123',
            title: 'Codex Task',
            count: 5,
            active: true,
            updatedAt: 2_000,
            lastSeenAt: 2_000,
            heartbeat: {
              lastReceivedAt: 2_000,
              expectedIntervalMs: 5_000,
              status: 'OK',
              missedCount: 0,
            },
            signals: [
              {
                detector: 'D4_TASK_COUNTER',
                evidence: 'detail-counter',
              },
            ],
          },
        },
        lastTotal: 9,
        debounce: {
          ms: 12_000,
          since: 0,
        },
      },
    });

    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.lastTotal).toBe(3);
    expect(snapshot.tabs['10']?.count).toBe(3);
    expect(snapshot.tabs['11']).toBeUndefined();
  });

  it('resets heartbeat status on TASKS_HEARTBEAT', async () => {
    let currentTime = 0;
    const { aggregator } = createAggregatorInstance({ now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 3, title: 'Codex' } } as chrome.runtime.MessageSender;
    const updateMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
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
      intervalMs: 5_000,
    };

    await aggregator.handleHeartbeat(heartbeat, sender);
    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['3'].heartbeat.status).toBe('OK');
    expect(snapshot.tabs['3'].heartbeat.lastReceivedAt).toBe(1_000);
  });

  it('marks tabs as stale after missed heartbeat interval', async () => {
    let currentTime = 0;
    const { aggregator } = createAggregatorInstance({ now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 11, title: 'Codex' } } as chrome.runtime.MessageSender;
    const heartbeat: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: 'https://chatgpt.com/codex',
      ts: 0,
      lastUpdateTs: 0,
      intervalMs: 10_000,
    };
    await aggregator.handleHeartbeat(heartbeat, sender);

    currentTime = 61_000; // threshold is max(60s, 3 * interval)
    const stale = await aggregator.evaluateHeartbeatStatuses();
    expect(stale).toEqual([11]);

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['11'].heartbeat.status).toBe('STALE');
    expect(snapshot.tabs['11'].heartbeat.missedCount).toBeGreaterThanOrEqual(1);
  });

  it('does not mark heartbeat as stale before minimum threshold', async () => {
    let currentTime = 0;
    const { aggregator } = createAggregatorInstance({ now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 12, title: 'Codex' } } as chrome.runtime.MessageSender;
    const heartbeat: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: 'https://chatgpt.com/codex',
      ts: 0,
      lastUpdateTs: 0,
      intervalMs: 5_000,
    };
    await aggregator.handleHeartbeat(heartbeat, sender);

    currentTime = 45_000; // greater than 3 * interval but below minimum threshold
    const stale = await aggregator.evaluateHeartbeatStatuses();
    expect(stale).toEqual([]);

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['12'].heartbeat.status).toBe('OK');
    expect(snapshot.tabs['12'].heartbeat.missedCount).toBe(0);
  });

  it('clears debounce window when state remains idle', async () => {
    vi.useFakeTimers();
    let currentTime = 0;
    const { aggregator } = createAggregatorInstance({ now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 9, title: 'Codex' } } as chrome.runtime.MessageSender;
    const activeMessage: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: true,
      count: 1,
      signals: [],
      ts: 1_000,
    };
    const idleListener = vi.fn();
    aggregator.onIdleSettled((state) => idleListener(state));

    currentTime = 1_000;
    await aggregator.handleTasksUpdate(activeMessage, sender);

    currentTime = 2_000;
    const idleMessage: ContentScriptTasksUpdate = { ...activeMessage, active: false, count: 0, ts: 2_000 };
    await aggregator.handleTasksUpdate(idleMessage, sender);

    const preSnapshot = await aggregator.getSnapshot();
    expect(preSnapshot.debounce.since).toBe(2_000);

    currentTime = 2_000 + SETTINGS_DEFAULTS.debounceMs;
    await vi.advanceTimersByTimeAsync(SETTINGS_DEFAULTS.debounceMs);

    const postSnapshot = await aggregator.getSnapshot();
    expect(postSnapshot.debounce.since).toBe(0);
    expect(idleListener).toHaveBeenCalledTimes(1);
    expect(idleListener.mock.calls[0]?.[0].lastTotal).toBe(0);

    vi.useRealTimers();
  });

  it('updates debounce duration when settings change', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    let snapshot = await aggregator.getSnapshot();
    expect(snapshot.debounce.ms).toBe(SETTINGS_DEFAULTS.debounceMs);

    await chromeMock.storage.sync?.set({ debounceMs: 5_000 });
    await Promise.resolve();

    snapshot = await aggregator.getSnapshot();
    expect(snapshot.debounce.ms).toBe(5_000);
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

    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    attempt = 0;
    const message: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
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
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const message: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: true,
      count: 3,
      signals: [],
      ts: 1_000,
    };
    const sender = { tab: { id: 42, title: 'Codex' } } as chrome.runtime.MessageSender;
    await aggregator.handleTasksUpdate(message, sender);

    const { aggregator: restoredAggregator } = createAggregatorInstance();
    await restoredAggregator.ready;
   const snapshot = await restoredAggregator.getSnapshot();
    expect(snapshot.lastTotal).toBe(3);
    expect(snapshot.tabs['42']).toBeDefined();
  });

  it('resets to default when stored state is invalid', async () => {
    const storageKey = getSessionStateKey();
    const invalidState = {
      tabs: {
        bad: {
          origin: 'https://chatgpt.com/codex',
          title: 'Broken',
          count: -5,
          active: true,
          updatedAt: -1,
          lastSeenAt: -2,
          heartbeat: {
            lastReceivedAt: -3,
            expectedIntervalMs: 0,
            status: 'STALE',
            missedCount: -1,
          },
        },
      },
      lastTotal: -10,
      debounce: { ms: -1, since: -5 },
    };

    chromeMock.storage.session.get = vi.fn(async () => ({
      [storageKey]: invalidState,
    }));
    const setSpy = vi.spyOn(chromeMock.storage.session, 'set');

    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs).toEqual({});
    expect(snapshot.lastTotal).toBe(0);
    expect(snapshot.debounce.since).toBe(0);

    expect(setSpy).toHaveBeenCalled();
    const persisted = setSpy.mock.calls.at(-1)?.[0][storageKey];
    expect(persisted).toMatchObject({
      tabs: {},
      lastTotal: 0,
      debounce: { since: 0 },
    });
  });

  it('recovers from storage read failures', async () => {
    const storageKey = getSessionStateKey();
    chromeMock.storage.session.get = vi.fn(async () => {
      throw new Error('storage unavailable');
    });
    const setSpy = vi.spyOn(chromeMock.storage.session, 'set');

    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs).toEqual({});
    expect(snapshot.lastTotal).toBe(0);

    expect(setSpy).toHaveBeenCalled();
    const persisted = setSpy.mock.calls.at(-1)?.[0][storageKey];
    expect(persisted).toBeDefined();
  });

  it('ignores heartbeat messages without tab id', async () => {
    const { aggregator } = createAggregatorInstance();
    await aggregator.ready;

    const heartbeat: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: 'https://chatgpt.com/codex',
      ts: 1_000,
      lastUpdateTs: 800,
      intervalMs: 5_000,
    };

    await expect(
      aggregator.handleHeartbeat(heartbeat, { tab: undefined } as chrome.runtime.MessageSender),
    ).resolves.toBeUndefined();

    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs).toEqual({});
    expect(snapshot.lastTotal).toBe(0);
  });
});
