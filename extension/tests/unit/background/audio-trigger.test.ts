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
  private snapshot: AggregatedTabsState = {
    tabs: {},
    lastTotal: 0,
    debounce: { ms: 0, since: 0 },
  };

  onStateChange(listener: (event: AggregatorChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async getSnapshot(): Promise<AggregatedTabsState> {
    return JSON.parse(JSON.stringify(this.snapshot)) as AggregatedTabsState;
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

  emitTotals(previous: number, next: number): void {
    const previousState: AggregatedTabsState = {
      tabs: {},
      lastTotal: previous,
      debounce: { ms: 0, since: 0 },
    };
    const currentState: AggregatedTabsState = {
      tabs: {},
      lastTotal: next,
      debounce: { ms: 0, since: 0 },
    };
    this.snapshot = currentState;
    const event: AggregatorChangeEvent = {
      reason: 'tasks-update',
      previous: previousState,
      current: currentState,
    };
    for (const listener of this.listeners) {
      listener(event);
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

  test('broadcasts AUDIO_CHIME when total transitions to zero', async () => {
    const aggregator = new StubAggregator();
    initializeAudioTrigger(aggregator, { chrome: chromeMock });

    await Promise.resolve();
    await Promise.resolve();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'AUDIO_SETTINGS_UPDATE',
      sound: true,
      soundVolume: 0.2,
    });

    (chromeMock.runtime.sendMessage as SpyInstance).mockClear();
    (chromeMock.tabs.sendMessage as SpyInstance).mockClear();

    aggregator.emitTotals(2, 0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUDIO_CHIME', volume: 0.2 });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(101, { type: 'AUDIO_CHIME', volume: 0.2 });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(202, { type: 'AUDIO_CHIME', volume: 0.2 });
  });

  test('does not broadcast chime when sound is disabled', async () => {
    const aggregator = new StubAggregator();
    initializeAudioTrigger(aggregator, { chrome: chromeMock });

    await Promise.resolve();
    await Promise.resolve();

    await chromeMock.storage.sync?.set({ sound: false });

    (chromeMock.runtime.sendMessage as SpyInstance).mockClear();
    (chromeMock.tabs.sendMessage as SpyInstance).mockClear();

    aggregator.emitTotals(1, 0);
    await Promise.resolve();
    await Promise.resolve();

    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ type: 'AUDIO_CHIME' }),
    );
  });
});
