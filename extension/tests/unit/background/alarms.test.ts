import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { AggregatedTabsState } from '../../../src/shared/contracts';
import type {
  AggregatorChangeEvent,
  AggregatorEventReason,
  BackgroundAggregator,
} from '../../../src/background/aggregator';
import { registerAlarms } from '../../../src/background/alarms';
import {
  type ChromeTestEnvironment,
  flushMicrotasks,
  setupChromeTestEnvironment,
} from '../../support/environment';

describe('background alarms', () => {
  let chromeMock: ReturnType<typeof setupChromeTestEnvironment>['chrome'];
  let env: ChromeTestEnvironment;

  beforeEach(() => {
    env = setupChromeTestEnvironment();
    chromeMock = env.chrome;
  });

  afterEach(() => {
    env.restore();
  });

  it('enforces autoDiscardable=false for tracked tabs', async () => {
    const state: AggregatedTabsState = {
      tabs: {
        '5': {
          origin: 'https://codex.openai.com',
          title: 'Codex',
          count: 1,
          active: true,
          updatedAt: 1_000,
          lastSeenAt: 1_000,
          heartbeat: {
            lastReceivedAt: 1_000,
            expectedIntervalMs: 15_000,
            status: 'OK',
            missedCount: 0,
          },
          signals: [],
        },
      },
      lastTotal: 1,
      debounce: { ms: 12_000, since: 0 },
    };

    const aggregator = createAggregatorStub(state);
    registerAlarms(aggregator, { chrome: chromeMock });

    await flushMicrotasks();
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(5, { autoDiscardable: false });

    chromeMock.tabs.update.mockClear();
    state.tabs['6'] = {
      ...state.tabs['5'],
      active: false,
    };
    emitChange(aggregator, state, 'tasks-update');
    await flushMicrotasks();
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(6, { autoDiscardable: false });
  });

  it('pings stale tabs on alarm tick', async () => {
    const state: AggregatedTabsState = {
      tabs: {
        '7': {
          origin: 'https://codex.openai.com',
          title: 'Codex',
          count: 0,
          active: false,
          updatedAt: 0,
          lastSeenAt: 0,
          heartbeat: {
            lastReceivedAt: 0,
            expectedIntervalMs: 15_000,
            status: 'STALE',
            missedCount: 1,
          },
          signals: [],
        },
      },
      lastTotal: 0,
      debounce: { ms: 12_000, since: 0 },
    };

    const aggregator = createAggregatorStub(state);
    const staleTabs = [7];
    aggregator.evaluateHeartbeatStatuses = vi.fn(async () => staleTabs);
    registerAlarms(aggregator, { chrome: chromeMock });

    chromeMock.__events.alarms.onAlarm.emit({ name: 'codex-poll' } as chrome.alarms.Alarm);
    await flushMicrotasks();

    expect(aggregator.evaluateHeartbeatStatuses).toHaveBeenCalled();
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'PING' });
  });
});

type AggregatorStub = BackgroundAggregator & {
  emit: (event: AggregatorChangeEvent) => void;
};

function createAggregatorStub(initial: AggregatedTabsState): AggregatorStub {
  let snapshot = initial;
  const listeners = new Set<(event: AggregatorChangeEvent) => void>();
  const aggregator: Partial<AggregatorStub> = {
    ready: Promise.resolve(),
    onStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: vi.fn(async () => snapshot),
    getTrackedTabIds: vi.fn(async () => Object.keys(snapshot.tabs).map(Number)),
    handleTasksUpdate: vi.fn(async () => undefined),
    handleHeartbeat: vi.fn(async () => undefined),
    handleTabRemoved: vi.fn(async () => undefined),
    evaluateHeartbeatStatuses: vi.fn(async () => [] as number[]),
    clearDebounceIfIdle: vi.fn(async () => false),
    emit(event) {
      listeners.forEach((listener) => listener(event));
    },
  };
  return aggregator as AggregatorStub;
}

function emitChange(
  aggregator: AggregatorStub,
  state: AggregatedTabsState,
  reason: AggregatorEventReason,
): void {
  const event: AggregatorChangeEvent = {
    reason,
    previous: state,
    current: state,
  };
  aggregator.emit(event);
}
