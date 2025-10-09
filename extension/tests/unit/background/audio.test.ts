import { beforeEach, describe, expect, test, vi } from 'vitest';

import { initializeAudioNotifier } from '../../../src/background/audio';
import { createMockChrome, setChromeInstance, type ChromeMock } from '../../../src/shared/chrome';
import type { AggregatedTabsState } from '../../../src/shared/contracts';
import type { AggregatorChangeEvent, BackgroundAggregator } from '../../../src/background/aggregator';

class FakeGainNode {
  public readonly gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  addEventListener = vi.fn();
}

class FakeOscillatorNode extends FakeSourceNode {
  public type = 'sine';
  public readonly frequency = { value: 0 };
}

class FakeAudioContext {
  public state: AudioContextState = 'running';
  public currentTime = 0;
  public readonly destination = {};
  public readonly createdGains: FakeGainNode[] = [];
  public readonly oscillators: FakeOscillatorNode[] = [];
  createGain = vi.fn(() => {
    const node = new FakeGainNode();
    this.createdGains.push(node);
    return node;
  });
  createOscillator = vi.fn(() => {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  });
  createBufferSource = vi.fn(() => new FakeSourceNode());
  decodeAudioData = vi.fn(() => Promise.reject(new Error('decode unsupported')));
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
}

class StubAggregator implements BackgroundAggregator {
  public readonly ready = Promise.resolve();
  private lastTotal = 0;
  private listeners = new Set<(event: AggregatorChangeEvent) => void>();

  constructor(initial: number) {
    this.lastTotal = initial;
  }

  onStateChange(listener: (event: AggregatorChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async getSnapshot(): Promise<AggregatedTabsState> {
    return {
      tabs: {},
      lastTotal: this.lastTotal,
      debounce: { ms: 0, since: 0 },
    };
  }

  emitTotals(next: number): void {
    const previous = this.lastTotal;
    this.lastTotal = next;
    const event: AggregatorChangeEvent = {
      reason: 'tasks-update',
      previous: { tabs: {}, lastTotal: previous, debounce: { ms: 0, since: 0 } },
      current: { tabs: {}, lastTotal: next, debounce: { ms: 0, since: 0 } },
    };
    for (const listener of Array.from(this.listeners)) {
      listener(event);
    }
  }

  // unused members
  getTrackedTabIds = vi.fn(async () => []);
  handleTasksUpdate = vi.fn(async () => {});
  handleHeartbeat = vi.fn(async () => {});
  handleTabRemoved = vi.fn(async () => {});
  evaluateHeartbeatStatuses = vi.fn(async () => []);
  clearDebounceIfIdle = vi.fn(async () => false);
}

let audioContextFactory: vi.Mock;

describe('audio notifier', () => {
  let chromeMock: ChromeMock;
  const originalAudioContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    chromeMock = createMockChrome();
    setChromeInstance(chromeMock);
    audioContextFactory = vi.fn(() => new FakeAudioContext());
    globalThis.AudioContext = audioContextFactory as unknown as typeof AudioContext;
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    setChromeInstance(undefined);
    globalThis.AudioContext = originalAudioContext;
    globalThis.fetch = originalFetch;
  });

  test('plays chime when total transitions from positive to zero', async () => {
    const aggregator = new StubAggregator(2);
    chromeMock.runtime.getURL = vi.fn((path: string) => path);
    const controller = initializeAudioNotifier(aggregator, { chrome: chromeMock });

    await controller.activate();

    const createdContext = audioContextFactory.mock.results[0].value as FakeAudioContext;

    aggregator.emitTotals(1);
    await vi.advanceTimersByTimeAsync(10);
    aggregator.emitTotals(0);
    await vi.advanceTimersByTimeAsync(10);

    expect(createdContext.createOscillator).toHaveBeenCalled();
    const oscillator = createdContext.oscillators[0];
    expect(oscillator.start).toHaveBeenCalled();

    controller.dispose();
  });
});
