import { beforeEach, describe, expect, test, vi, type SpyInstance } from 'vitest';

import { initializeAudioTrigger } from '../../../src/background/audio-trigger';
import {
  createMockChrome,
  setChromeInstance,
  type ChromeMock,
} from '../../../src/shared/chrome';
import type { AggregatedTabsState, AggregatorChangeEvent } from '../../../src/shared/contracts';
import type { BackgroundAggregator } from '../../../src/background/aggregator';

class StubAggregator implements BackgroundAggregator {
  public readonly ready = Promise.resolve();
  private listeners = new Set<(event: AggregatorChangeEvent) => void>();
  private snapshot: AggregatedTabsState = createState();

  onStateChange(listener: (event: AggregatorChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
  async evaluateHeartbeatStatuses(): Promise<number[]> {
    return [];
  }
  async clearDebounceIfIdle(): Promise<boolean> {
    return false;
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
}

describe('audio trigger', () => {
  let chromeMock: ChromeMock;

  beforeEach(() => {
    chromeMock = createMockChrome();
    setChromeInstance(chromeMock);
    vi.spyOn(chromeMock.runtime, 'sendMessage');
    vi.spyOn(chromeMock.tabs, 'sendMessage');
  });

  test('broadcasts AUDIO_CHIME after debounce window elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const aggregator = new StubAggregator();
    initializeAudioTrigger(aggregator, { chrome: chromeMock });

    await flushAsync();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'AUDIO_SETTINGS_UPDATE',
      sound: true,
      soundVolume: 0.2,
    });

    (chromeMock.runtime.sendMessage as SpyInstance).mockClear();
    (chromeMock.tabs.sendMessage as SpyInstance).mockClear();

    const previousState = createState({ lastTotal: 2, debounceSince: 0 });
    const currentState = createState({ lastTotal: 0, debounceSince: Date.now() });
    aggregator.emit({
      reason: 'tasks-update',
      previous: previousState,
      current: currentState,
    });

    await flushAsync();

    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'AUDIO_CHIME', volume: 0.2 });

    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    await flushAsync();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUDIO_CHIME', volume: 0.2 });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(101, { type: 'AUDIO_CHIME', volume: 0.2 });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(202, { type: 'AUDIO_CHIME', volume: 0.2 });
    vi.useRealTimers();
  });

  test('does not broadcast chime when sound is disabled', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const aggregator = new StubAggregator();
    initializeAudioTrigger(aggregator, { chrome: chromeMock });

    await flushAsync();
    await chromeMock.storage.sync?.set({ sound: false });

    (chromeMock.runtime.sendMessage as SpyInstance).mockClear();
    (chromeMock.tabs.sendMessage as SpyInstance).mockClear();

    const previousState = createState({ lastTotal: 1 });
    const currentState = createState({ lastTotal: 0, debounceSince: Date.now() });
    aggregator.emit({
      reason: 'tasks-update',
      previous: previousState,
      current: currentState,
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    await flushAsync();

    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
    vi.useRealTimers();
  });

  test('skips chime when totals bounce back before debounce clears', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const aggregator = new StubAggregator();
    initializeAudioTrigger(aggregator, { chrome: chromeMock });

    await flushAsync();

    (chromeMock.runtime.sendMessage as SpyInstance).mockClear();
    (chromeMock.tabs.sendMessage as SpyInstance).mockClear();

    const idleState = createState({ lastTotal: 0, debounceSince: Date.now() });
    aggregator.emit({
      reason: 'tasks-update',
      previous: createState({ lastTotal: 3 }),
      current: idleState,
    });

    await flushAsync();

    aggregator.emit({
      reason: 'tasks-update',
      previous: idleState,
      current: createState({ lastTotal: 4, debounceSince: 0 }),
    });

    await flushAsync();

    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    await flushAsync();

    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
    vi.useRealTimers();
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
