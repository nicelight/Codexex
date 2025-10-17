import { beforeEach, describe, expect, test, vi, type SpyInstance } from 'vitest';

import { initializeAudioTrigger } from '../../../src/background/audio-trigger';
import {
  createMockChrome,
  setChromeInstance,
  type ChromeMock,
} from '../../../src/shared/chrome';
import type { AggregatedTabsState } from '../../../src/shared/contracts';
import type { AggregatorChangeEvent, BackgroundAggregator } from '../../../src/background/aggregator';

class StubAggregator implements BackgroundAggregator {
  public readonly ready = Promise.resolve();
  private listeners = new Set<(event: AggregatorChangeEvent) => void>();
  private idleListeners = new Set<(state: AggregatedTabsState) => void>();
  private snapshot: AggregatedTabsState = createState();

  onStateChange(listener: (event: AggregatorChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onIdleSettled(listener: (state: AggregatedTabsState) => void): () => void {
    this.idleListeners.add(listener);
    return () => this.idleListeners.delete(listener);
  }

  async getSnapshot(): Promise<AggregatedTabsState> {
    return cloneState(this.snapshot);
  }

  async getTrackedTabIds(): Promise<number[]> {
    return [101, 202];
  }

  async handleTasksUpdate(): Promise<void> {}
  async handleHeartbeat(): Promise<void> {}
  async handleTabRemoved(): Promise<void> {}
  async handleTabNavigated(): Promise<void> {}
  async evaluateHeartbeatStatuses(): Promise<number[]> {
    return [];
  }
  emit(event: AggregatorChangeEvent): void {
    this.snapshot = cloneState(event.current);
    const payload: AggregatorChangeEvent = {
      ...event,
      previous: cloneState(event.previous),
      current: cloneState(event.current),
      staleTabIds: event.staleTabIds ? [...event.staleTabIds] : undefined,
    };
    for (const listener of this.listeners) {
      listener(payload);
    }
  }

  emitIdle(state?: AggregatedTabsState): void {
    const snapshot = state ? cloneState(state) : cloneState(this.snapshot);
    this.snapshot = snapshot;
    for (const listener of this.idleListeners) {
      listener(cloneState(snapshot));
    }
  }
}

describe('audio trigger', () => {
  let chromeMock: ChromeMock;
  let runtimeSendMessageSpy: SpyInstance;
  let tabsSendMessageSpy: SpyInstance;

  beforeEach(() => {
    chromeMock = createMockChrome();
    setChromeInstance(chromeMock);
    runtimeSendMessageSpy = vi.spyOn(chromeMock.runtime, 'sendMessage');
    tabsSendMessageSpy = vi.spyOn(chromeMock.tabs, 'sendMessage');
  });

  test('broadcasts AUDIO_CHIME after idle notification', async () => {
    const aggregator = new StubAggregator();
    initializeAudioTrigger(aggregator, { chrome: chromeMock });

    await flushAsync();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'AUDIO_SETTINGS_UPDATE',
      sound: true,
      soundVolume: 0.2,
    });

    runtimeSendMessageSpy.mockClear();
    tabsSendMessageSpy.mockClear();

    aggregator.emitIdle(createState({ lastTotal: 0 }));

    await flushAsync();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUDIO_CHIME', volume: 0.2 });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(101, { type: 'AUDIO_CHIME', volume: 0.2 });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(202, { type: 'AUDIO_CHIME', volume: 0.2 });
  });

  test('does not broadcast chime when sound is disabled', async () => {
    const aggregator = new StubAggregator();
    initializeAudioTrigger(aggregator, { chrome: chromeMock });

    await flushAsync();
    await chromeMock.storage.sync?.set({ sound: false });

    runtimeSendMessageSpy.mockClear();
    tabsSendMessageSpy.mockClear();

    aggregator.emitIdle(createState({ lastTotal: 0 }));

    await flushAsync();

    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
  });

  test('skips chime when totals bounce back before idle settles', async () => {
    const aggregator = new StubAggregator();
    initializeAudioTrigger(aggregator, { chrome: chromeMock });

    await flushAsync();

    runtimeSendMessageSpy.mockClear();
    tabsSendMessageSpy.mockClear();

    aggregator.emit({
      reason: 'tasks-update',
      previous: createState({ lastTotal: 3 }),
      current: createState({ lastTotal: 0 }),
    });

    aggregator.emit({
      reason: 'tasks-update',
      previous: createState({ lastTotal: 0 }),
      current: createState({ lastTotal: 4 }),
    });

    aggregator.emitIdle(createState({ lastTotal: 4 }));

    await flushAsync();

    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
  });
});

const DEFAULT_DEBOUNCE_MS = 12_000;

interface StateOptions {
  lastTotal?: number;
  debounceMs?: number;
  debounceSince?: number;
  tabs?: AggregatedTabsState['tabs'];
}

function createState(options: StateOptions = {}): AggregatedTabsState {
  const { lastTotal = 0, debounceMs = DEFAULT_DEBOUNCE_MS, debounceSince = 0, tabs } = options;
  return {
    tabs: tabs ? cloneState(tabs) : {},
    lastTotal,
    debounce: { ms: debounceMs, since: debounceSince },
  };
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
