import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

import { initializeActionIndicator, deriveBadgeVisual } from '../../../src/background/action-indicator';
import type { AggregatedTabsState } from '../../../src/shared/contracts';
import {
  createMockChrome,
  noopLogger,
  setChromeInstance,
  type ChromeMock,
} from '../../../src/shared/chrome';
import type { AggregatorChangeEvent, BackgroundAggregator } from '../../../src/background/aggregator';

class FakeImageData {
  public readonly data: Uint8ClampedArray;
  public readonly width: number;
  public readonly height: number;

  constructor(width: number, height: number, data?: Uint8ClampedArray) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8ClampedArray(width * height * 4);
  }
}

class FakeOffscreenContext {
  public fillStyle = '';
  public font = '';
  public textAlign: CanvasTextAlign = 'center';
  public textBaseline: CanvasTextBaseline = 'middle';

  constructor(private readonly width: number, private readonly height: number) {}

  clearRect(): void {}

  fillText(): void {}

  strokeText(): void {}

  getImageData(): ImageData {
    return new FakeImageData(this.width, this.height) as unknown as ImageData;
  }
}

class FakeOffscreenCanvas {
  constructor(private readonly width: number, private readonly height: number) {}

  getContext(): FakeOffscreenContext {
    return new FakeOffscreenContext(this.width, this.height);
  }
}

class StubAggregator implements BackgroundAggregator {
  public readonly ready = Promise.resolve();
  private state: AggregatedTabsState;
  private listeners = new Set<(event: AggregatorChangeEvent) => void>();

  constructor(initialTotal: number) {
    this.state = {
      tabs: {},
      lastTotal: initialTotal,
      debounce: {
        ms: 12000,
        since: 0,
      },
    };
  }

  onStateChange(listener: (event: AggregatorChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async getSnapshot(): Promise<AggregatedTabsState> {
    return JSON.parse(JSON.stringify(this.state)) as AggregatedTabsState;
  }

  async getTrackedTabIds(): Promise<number[]> {
    return [];
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

  emitTotal(total: number): void {
    const previous = this.state;
    this.state = {
      ...this.state,
      lastTotal: total,
    };
    const event: AggregatorChangeEvent = {
      reason: 'tasks-update',
      previous,
      current: this.state,
    };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

describe('action-indicator', () => {
  let chromeMock: ChromeMock;
  const originalImageData = globalThis.ImageData;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;

  beforeEach(() => {
    vi.useFakeTimers();
    if (typeof globalThis.ImageData === 'undefined') {
      globalThis.ImageData = FakeImageData as unknown as typeof ImageData;
    }
    if (typeof globalThis.OffscreenCanvas === 'undefined') {
      globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
    }
    chromeMock = createMockChrome();
    setChromeInstance(chromeMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    setChromeInstance(undefined);
    if (originalImageData) {
      globalThis.ImageData = originalImageData;
    } else {
      delete (globalThis as Partial<typeof globalThis>).ImageData;
    }
    if (originalOffscreenCanvas) {
      globalThis.OffscreenCanvas = originalOffscreenCanvas;
    } else {
      delete (globalThis as Partial<typeof globalThis>).OffscreenCanvas;
    }
  });

  test('deriveBadgeVisual maps palette', () => {
    expect(deriveBadgeVisual(-3)).toEqual({ text: '0', color: '#16A34A' });
    expect(deriveBadgeVisual(0)).toEqual({ text: '0', color: '#16A34A' });
    expect(deriveBadgeVisual(1)).toEqual({ text: '1', color: '#F97316' });
    expect(deriveBadgeVisual(2)).toEqual({ text: '2', color: '#F2542D' });
    expect(deriveBadgeVisual(3)).toEqual({ text: '3', color: '#E11D48' });
    expect(deriveBadgeVisual(7)).toEqual({ text: '7', color: '#C2185B' });
    expect(deriveBadgeVisual(120)).toEqual({ text: '9', color: '#C2185B' });
  });

  test('initializeActionIndicator updates icon and title', async () => {
    const action = chromeMock.action!;
    const aggregator = new StubAggregator(0);

    const controller = initializeActionIndicator(aggregator, { chrome: chromeMock, logger: noopLogger });
    await vi.advanceTimersByTimeAsync(0);
    aggregator.emitTotal(12);
    await vi.advanceTimersByTimeAsync(250);

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(action.setIcon).toHaveBeenCalled();
    const iconCall = (action.setIcon as unknown as vi.Mock).mock.calls.pop();
    expect(iconCall?.[0]?.imageData).toBeDefined();
    expect(action.setTitle).toHaveBeenCalled();
    const titleCall = (action.setTitle as unknown as vi.Mock).mock.calls.pop();
    expect(titleCall?.[0]?.title).toContain('9 active Codex tasks');

    controller.dispose();
  });
});
