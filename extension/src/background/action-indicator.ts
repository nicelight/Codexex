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
const MAX_DISPLAYABLE_COUNT = 9;
const ICON_SIZES = [16, 24, 32] as const;
const ICON_FONT_RATIO = 0.92;

interface BadgeVisual {
  readonly text: string;
  readonly color: string;
}

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
  const canRenderIcons = hasIconRenderingSupport();

  if (!canRenderIcons) {
    logger.debug('OffscreenCanvas/ImageData unavailable; falling back to badge text');
  }

  const applyState = throttle(async (state: AggregatedTabsState) => {
    if (disposed) {
      return;
    }
    const visual = deriveBadgeVisual(state.lastTotal ?? 0);
    await safeCall(() => actionApi.setBadgeBackgroundColor({ color: BADGE_BACKGROUND }));
    await safeCall(() => actionApi.setBadgeText({ text: '' }));
    if (actionApi.setTitle) {
      await safeCall(() => actionApi.setTitle({ title: tooltipFormatter(visual.text) }));
    }
    if (canRenderIcons && actionApi.setIcon) {
      const iconSet = createTextIconSet(visual.text, visual.color, logger);
      if (iconSet) {
        await safeCall(() => actionApi.setIcon({ imageData: iconSet }));
      }
    } else if (actionApi.setBadgeTextColor) {
      await safeCall(() => actionApi.setBadgeTextColor({ color: visual.color }));
      await safeCall(() => actionApi.setBadgeText({ text: visual.text }));
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
  const text = safeTotal > MAX_DISPLAYABLE_COUNT ? String(MAX_DISPLAYABLE_COUNT) : String(safeTotal);
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

function hasIconRenderingSupport(): boolean {
  return typeof OffscreenCanvas !== 'undefined' && typeof ImageData !== 'undefined';
}

function createTextIconSet(
  text: string,
  color: string,
  logger: ChromeLogger,
): Record<number, ImageData> | undefined {
  if (!hasIconRenderingSupport()) {
    return undefined;
  }
  try {
    const entries: Record<number, ImageData> = {};
    for (const size of ICON_SIZES) {
      entries[size] = createTextImageData(size, text, color);
    }
    return entries;
  } catch (error) {
    logger.warn('failed to render text icon, falling back to transparent icon', error);
    return createTransparentIconSet(ICON_SIZES);
  }
}

function createTextImageData(size: number, text: string, color: string): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('OffscreenCanvas context unavailable');
  }
  context.clearRect(0, 0, size, size);
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const fontSize = Math.floor(size * ICON_FONT_RATIO);
  context.font = `900 ${fontSize}px "Inter","Segoe UI","Roboto",sans-serif`;
  context.lineJoin = 'round';
  const strokeWidth = Math.max(1, Math.floor(size * 0.08));
  context.strokeStyle = 'rgba(0,0,0,0.08)';
  context.lineWidth = strokeWidth;
  context.strokeText(text, size / 2, size / 2);
  context.fillText(text, size / 2, size / 2);
  return context.getImageData(0, 0, size, size);
}

function createTransparentIconSet(sizes: readonly number[]): Record<number, ImageData> {
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
