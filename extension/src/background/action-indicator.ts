import type { AggregatedTabsState } from '../shared/contracts';
import {
  createChildLogger,
  createLogger,
  resolveChrome,
  throttle,
  type ChromeLike,
  type ChromeLogger,
} from '../shared/chrome';
import { resolveLocale } from '../shared/locale';
import type { BackgroundAggregator } from './aggregator';

const BADGE_BACKGROUND: chrome.action.ColorArray = [0, 0, 0, 0];
const UPDATE_THROTTLE_MS = 200;
const MAX_DISPLAYABLE_COUNT = 99;

type BadgeVisual = {
  readonly text: string;
  readonly color: string;
};

const COLOR_SCALE: ReadonlyArray<{ readonly threshold: number; readonly color: string }> = [
  { threshold: 0, color: '#16A34A' },
  { threshold: 1, color: '#F97316' },
  { threshold: 2, color: '#F2542D' },
  { threshold: 3, color: '#E11D48' },
  { threshold: 4, color: '#C2185B' },
];

const TOOLTIP_BY_LOCALE: Record<'en' | 'ru', (count: string) => string> = {
  en: (count) => `${count} active Codex tasks`,
  ru: (count) => `${count} активных задач Codex`,
};

export interface ActionIndicatorOptions {
  readonly chrome?: ChromeLike;
  readonly logger?: ChromeLogger;
}

export interface ActionIndicatorController {
  dispose(): void;
}

export function initializeActionIndicator(
  aggregator: BackgroundAggregator,
  options: ActionIndicatorOptions = {},
): ActionIndicatorController {
  const chrome = options.chrome ?? resolveChrome();
  const actionApi = chrome.action;
  const baseLogger = options.logger ?? createLogger('codex-background');
  const logger = createChildLogger(baseLogger, 'action-indicator');

  if (!actionApi) {
    logger.warn('chrome.action API is unavailable; badge indicator disabled');
    return {
      dispose() {
        /* noop */
      },
    };
  }

  let disposed = false;
  const locale = resolveLocale(chrome);
  const tooltipFormatter = TOOLTIP_BY_LOCALE[locale] ?? TOOLTIP_BY_LOCALE.en;

  void ensureBaseIcon(actionApi, logger);

  const applyState = throttle(async (state: AggregatedTabsState) => {
    if (disposed) {
      return;
    }
    const visual = deriveBadgeVisual(state.lastTotal ?? 0);
    await safeCall(() => actionApi.setBadgeBackgroundColor({ color: BADGE_BACKGROUND }));
    await safeCall(() => actionApi.setBadgeText({ text: visual.text }));
    if (actionApi.setBadgeTextColor) {
      await safeCall(() => actionApi.setBadgeTextColor({ color: visual.color }));
    }
    if (actionApi.setTitle) {
      await safeCall(() => actionApi.setTitle({ title: tooltipFormatter(visual.text) }));
    }
  }, UPDATE_THROTTLE_MS);

  const unsubscribe = aggregator.onStateChange((event) => {
    void applyState(event.current);
  });

  void aggregator.ready
    .then(() => aggregator.getSnapshot())
    .then((state) => applyState(state))
    .catch((error) => {
      logger.error('failed to apply initial badge state', error);
    });

  return {
    dispose() {
      disposed = true;
      unsubscribe();
      applyState.cancel?.();
    },
  };

  async function safeCall(action: () => Promise<void> | void): Promise<void> {
    try {
      await action();
    } catch (error) {
      logger.warn('action API call failed', error);
    }
  }
}

export function deriveBadgeVisual(total: number): BadgeVisual {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const text = safeTotal > MAX_DISPLAYABLE_COUNT ? `${MAX_DISPLAYABLE_COUNT}+` : String(safeTotal);
  const color = selectColor(safeTotal);
  return { text, color };
}

function selectColor(total: number): string {
  for (let index = COLOR_SCALE.length - 1; index >= 0; index -= 1) {
    const entry = COLOR_SCALE[index];
    if (total >= entry.threshold) {
      return entry.color;
    }
  }
  return COLOR_SCALE[0].color;
}

async function ensureBaseIcon(actionApi: typeof chrome.action, logger: ChromeLogger): Promise<void> {
  if (!actionApi.setIcon) {
    return;
  }
  if (typeof ImageData === 'undefined') {
    logger.debug('ImageData is not available; skipping transparent icon initialization');
    return;
  }
  try {
    const imageData = createTransparentIconSet([16, 24, 32]);
    await actionApi.setIcon({ imageData });
  } catch (error) {
    logger.warn('failed to set transparent action icon', error);
  }
}

function createTransparentIconSet(sizes: number[]): Record<number, ImageData> {
  const entries: Record<number, ImageData> = {};
  for (const size of sizes) {
    entries[size] = createTransparentImageData(size);
  }
  return entries;
}

function createTransparentImageData(size: number): ImageData {
  const length = size * size * 4;
  const buffer = new Uint8ClampedArray(length);
  return new ImageData(buffer, size, size);
}
