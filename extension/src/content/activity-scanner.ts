import type { ContentScriptTasksUpdateSignal } from '../shared/contracts';
import { createChildLogger, type ChromeLogger } from '../shared/chrome';

export interface TaskActivitySnapshot {
  readonly active: boolean;
  readonly count: number;
  readonly signals: ContentScriptTasksUpdateSignal[];
  readonly ts: number;
}

export interface ActivityScannerOptions {
  readonly document: Document;
  readonly logger: ChromeLogger;
}

const SPINNER_SELECTORS = [
  '[aria-busy="true"]',
  '[role="progressbar"]',
  '.animate-spin',
  '.loading-spinner',
  'svg[role="img"] animateTransform',
] as const;

const STOP_TEXTS = {
  en: ['stop', 'stop run', 'cancel', 'cancel run', 'cancel task'],
  ru: ['остановить', 'прервать', 'отменить', 'отменить задачу'],
} as const;

const STOP_SELECTORS = ['button', '[role="button"]', 'a[href]'] as const;

const COUNTER_CONTAINER_SELECTOR =
  'div.absolute.inset-0.flex.items-center.justify-center';

export class ActivityScanner {
  private readonly document: Document;
  private readonly logger: ChromeLogger;

  constructor(options: ActivityScannerOptions) {
    this.document = options.document;
    this.logger = createChildLogger(options.logger, 'scanner');
  }

  public reset(): void {
    // Нечего сбрасывать — оставляем метод для совместимости с рантаймом
  }

  public scan(now: number): TaskActivitySnapshot {
    const locale = detectLocale(this.document);
    const spinnerSignals = collectSpinnerSignals(this.document);
    const stopSignals = collectStopSignals(this.document, locale);
    const counterResult = collectCounterSignal(this.document);

    const signals: ContentScriptTasksUpdateSignal[] = [
      ...spinnerSignals,
      ...stopSignals,
      ...(counterResult ? [counterResult.signal] : []),
    ];

    const countCandidates = [
      spinnerSignals.length > 0 ? Math.max(1, spinnerSignals.length) : 0,
      stopSignals.length,
      counterResult?.count ?? 0,
    ];
    const count = countCandidates.reduce((max, value) => Math.max(max, value), 0);
    const active = count > 0;

    this.logger.debug(
      'scan result',
      JSON.stringify({
        active,
        count,
        spinnerSignals: spinnerSignals.length,
        stopSignals: stopSignals.length,
        counter: counterResult?.count ?? 0,
      }),
    );

    return {
      active,
      count,
      signals,
      ts: now,
    };
  }
}

function detectLocale(documentRef: Document): 'en' | 'ru' {
  const documentLang = documentRef.documentElement.lang?.trim().toLowerCase();
  if (documentLang?.startsWith('ru')) {
    return 'ru';
  }
  const navigatorLang = documentRef.defaultView?.navigator.language?.toLowerCase();
  if (navigatorLang?.startsWith('ru')) {
    return 'ru';
  }
  return 'en';
}

function collectSpinnerSignals(documentRef: Document): ContentScriptTasksUpdateSignal[] {
  const seen = new Set<Element>();
  const signals: ContentScriptTasksUpdateSignal[] = [];
  const root = documentRef.documentElement ?? documentRef;

  SPINNER_SELECTORS.forEach((selector) => {
    root.querySelectorAll(selector).forEach((element) => {
      if (seen.has(element)) {
        return;
      }
      seen.add(element);
      if (signals.length >= 5) {
        return;
      }
      signals.push({
        detector: 'D1_SPINNER',
        evidence: `${elementEvidence(element)}#${signals.length}`,
      });
    });
  });

  return signals;
}

function collectStopSignals(
  documentRef: Document,
  locale: 'en' | 'ru',
): ContentScriptTasksUpdateSignal[] {
  const signals: ContentScriptTasksUpdateSignal[] = [];
  const root = documentRef.documentElement ?? documentRef;
  const elements = Array.from(root.querySelectorAll(STOP_SELECTORS.join(',')));

  elements.forEach((element) => {
    if (!isElementVisible(element, documentRef)) {
      return;
    }
    if (isElementDisabled(element)) {
      return;
    }
    if (isListingGroupContext(element)) {
      return;
    }
    if (!matchesStopHints(element, locale)) {
      return;
    }

    const evidenceIndex = signals.length;
    const taskKey = findTaskKey(element);
    if (taskKey && shouldIgnoreTaskKey(taskKey)) {
      return;
    }
    signals.push({
      detector: 'D2_STOP_BUTTON',
      evidence: `${elementEvidence(element)}#${evidenceIndex}`,
      ...(taskKey ? { taskKey } : {}),
    });
  });

  return signals;
}

function collectCounterSignal(
  documentRef: Document,
): { count: number; signal: ContentScriptTasksUpdateSignal } | undefined {
  const root = documentRef.documentElement ?? documentRef;
  const containers = Array.from(root.querySelectorAll(COUNTER_CONTAINER_SELECTOR));
  let bestCount = 0;
  let bestEvidence: string | undefined;

  containers.forEach((container, index) => {
    const parsed = parseCounterValue(container);
    if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed > bestCount) {
      bestCount = parsed;
      bestEvidence = `${elementEvidence(container)}#${index}`;
    }
  });

  if (bestCount <= 0 || !bestEvidence) {
    return undefined;
  }

  return {
    count: bestCount,
    signal: { detector: 'D4_TASK_COUNTER', evidence: bestEvidence },
  };
}

function parseCounterValue(element: Element): number | undefined {
  const text = element.textContent?.trim();
  if (!text) {
    return undefined;
  }
  const match = text.match(/\d+/);
  if (!match) {
    return undefined;
  }
  const value = Number.parseInt(match[0] ?? '', 10);
  return Number.isNaN(value) ? undefined : value;
}

function matchesStopHints(element: Element, locale: 'en' | 'ru'): boolean {
  const textSources: string[] = [];

  if (element.textContent) {
    textSources.push(element.textContent);
  }
  if (element instanceof HTMLElement) {
    const title = element.getAttribute('title');
    const ariaLabel = element.getAttribute('aria-label');
    const dataTestId = element.getAttribute('data-testid');
    if (title) {
      textSources.push(title);
    }
    if (ariaLabel) {
      textSources.push(ariaLabel);
    }
    if (dataTestId) {
      textSources.push(dataTestId);
    }
  }

  return textSources.some((source) => includesStopText(source, locale));
}

function includesStopText(value: string, locale: 'en' | 'ru'): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const baseMatches = STOP_TEXTS[locale].some((candidate) => normalized.includes(candidate));
  if (baseMatches) {
    return true;
  }
  return normalized.includes('stop') || normalized.includes('cancel');
}

function isElementDisabled(element: Element): boolean {
  if (element instanceof HTMLButtonElement && element.disabled) {
    return true;
  }
  const ariaDisabled = element.getAttribute?.('aria-disabled');
  if (typeof ariaDisabled === 'string' && ariaDisabled.toLowerCase() === 'true') {
    return true;
  }
  return false;
}

function isElementVisible(element: Element, documentRef: Document): boolean {
  let current: Element | null = element;
  while (current) {
    if (current instanceof HTMLElement) {
      if (current.hidden) {
        return false;
      }
      const ariaHidden = current.getAttribute('aria-hidden');
      if (typeof ariaHidden === 'string' && ariaHidden.toLowerCase() === 'true') {
        return false;
      }
      const view = current.ownerDocument?.defaultView ?? documentRef.defaultView;
      if (view) {
        const style = view.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return false;
        }
        const opacity = Number.parseFloat(style.opacity || '1');
        if (Number.isFinite(opacity) && opacity === 0) {
          return false;
        }
      }
    }
    current = current.parentElement;
  }
  return true;
}

function findTaskKey(element: Element): string | undefined {
  let current: Element | null = element;
  const visited = new Set<Element>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const taskId =
      current.getAttribute?.('data-task-id') ??
      current.getAttribute?.('data-id') ??
      current.getAttribute?.('data-reactid');
    if (taskId) {
      return taskId;
    }
    current = current.parentElement;
  }

  return undefined;
}

function shouldIgnoreTaskKey(taskKey: string): boolean {
  const normalized = taskKey.trim().toLowerCase();
  if (!normalized.startsWith('lg#')) {
    return false;
  }
  const suffix = normalized.slice(3);
  return suffix.length === 0 || /^\d+/.test(suffix);
}

function isListingGroupContext(element: Element): boolean {
  let current: Element | null = element;
  const visited = new Set<Element>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const candidates = [
      current.getAttribute?.('data-task-id'),
      current.getAttribute?.('data-id'),
      current.getAttribute?.('data-reactid'),
      current instanceof HTMLElement ? current.id : undefined,
    ];
    if (candidates.some((value) => (value ? shouldIgnoreTaskKey(value) : false))) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function elementEvidence(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const idPart = element.id ? `#${element.id}` : '';
  const classNames =
    element instanceof HTMLElement
      ? element.className
          .toString()
          .split(/\s+/)
          .filter((name) => name.length > 0)
          .slice(0, 3)
          .map((name) => `.${name}`)
          .join('')
      : '';
  return `${tag}${idPart}${classNames}` || tag;
}
