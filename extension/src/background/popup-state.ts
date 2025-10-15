import {
  assertPopupRenderState,
  type AggregatedTabsState,
  type PopupRenderState,
  type PopupRenderStateTab,
} from '../shared/contracts';
import { resolveChrome, type ChromeLike } from '../shared/chrome';
import { resolveLocale } from '../shared/locale';
import { getDefaultPopupMessages } from '../popup/messages';
import type { BackgroundAggregator } from './aggregator';

export interface PopupStateOptions {
  readonly chrome?: ChromeLike;
  readonly now?: () => number;
  readonly locale?: 'en' | 'ru';
}

export async function generatePopupRenderState(
  aggregator: BackgroundAggregator,
  options: PopupStateOptions = {},
): Promise<PopupRenderState> {
  const snapshot = await aggregator.getSnapshot();
  const chrome = options.chrome ?? resolveChrome();
  const locale = options.locale ?? resolveLocale(chrome);
  const now = options.now?.() ?? Date.now();
  const generatedAt = new Date(now).toISOString();

  const tabs = mapTabs(snapshot).filter((tab) => tab.count > 0);
  tabs.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    const lastSeenA = a.lastSeenAt ?? 0;
    const lastSeenB = b.lastSeenAt ?? 0;
    if (lastSeenB !== lastSeenA) {
      return lastSeenB - lastSeenA;
    }
    return b.tabId - a.tabId;
  });

  const totalActive = deriveAggregatedTotal(snapshot.lastTotal);
  const messages = { ...getDefaultPopupMessages(locale) };

  const state: PopupRenderState = {
    generatedAt,
    totalActive,
    tabs,
    locale,
    messages,
  };

  assertPopupRenderState(state);
  return state;
}

function deriveAggregatedTotal(total: number): number {
  if (!Number.isFinite(total)) {
    return 0;
  }
  const normalized = Math.max(0, Math.trunc(total));
  return normalized;
}

function mapTabs(state: AggregatedTabsState): PopupRenderStateTab[] {
  const entries: PopupRenderStateTab[] = [];
  for (const [tabKey, tabState] of Object.entries(state.tabs)) {
    const tabId = Number(tabKey);
    if (!Number.isFinite(tabId)) {
      continue;
    }
    entries.push({
      tabId,
      title: tabState.title,
      origin: tabState.origin,
      count: Math.max(0, tabState.count),
      lastSeenAt: tabState.lastSeenAt,
      heartbeatStatus: tabState.heartbeat.status,
      signals: tabState.signals ? tabState.signals.map((signal) => ({ ...signal })) : [],
    });
  }
  return entries;
}
