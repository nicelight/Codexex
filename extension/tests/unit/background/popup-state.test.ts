import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { generatePopupRenderState } from '../../../src/background/popup-state';
import type { BackgroundAggregator } from '../../../src/background/aggregator';
import { createMockChrome, setChromeInstance, type ChromeMock } from '../../../src/shared/chrome';

describe('generatePopupRenderState', () => {
  let chromeMock: ChromeMock;

  beforeEach(() => {
    chromeMock = createMockChrome({
      i18n: { getUILanguage: () => 'ru' },
    });
    setChromeInstance(chromeMock);
  });

  afterEach(() => {
    setChromeInstance(undefined);
  });

  it('maps aggregated state to popup render state and sorts tabs by activity', async () => {
    const snapshot = {
      tabs: {
        '10': {
          origin: 'https://codex.openai.com/work',
          title: 'Work tab',
          count: 1,
          active: true,
          updatedAt: 2_000,
          lastSeenAt: 2_000,
          heartbeat: {
            lastReceivedAt: 2_000,
            expectedIntervalMs: 15_000,
            status: 'OK' as const,
            missedCount: 0,
          },
          signals: [
            { detector: 'D1_SPINNER' as const, evidence: 'Spinner detected' },
          ],
        },
        '4': {
          origin: 'https://codex.openai.com/review',
          title: 'Review tab',
          count: 3,
          active: true,
          updatedAt: 3_000,
          lastSeenAt: 3_500,
          heartbeat: {
            lastReceivedAt: 3_500,
            expectedIntervalMs: 15_000,
            status: 'STALE' as const,
            missedCount: 1,
          },
        },
      },
      lastTotal: 4,
      debounce: { ms: 12_000, since: 0 },
    };

    const aggregator = {
      getSnapshot: vi.fn(async () => snapshot),
    } as unknown as BackgroundAggregator;

    const state = await generatePopupRenderState(aggregator, {
      chrome: chromeMock,
      now: () => 5_000,
    });

    expect(state.locale).toBe('ru');
    expect(state.generatedAt).toBe(new Date(5_000).toISOString());
    expect(state.totalActive).toBe(4);
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[0]).toMatchObject({ tabId: 4, count: 3 });
    expect(state.tabs[1]).toMatchObject({ tabId: 10, count: 1 });
    expect(state.tabs[0].signals).toEqual([]);
    expect(state.tabs[1].signals[0]).toEqual({
      detector: 'D1_SPINNER',
      evidence: 'Spinner detected',
    });
    expect(state.messages?.title).toBe('Наблюдатель задач Codex');
  });
});
