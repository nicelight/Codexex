import type { ContentScriptTasksUpdateSignal } from '../../shared/contracts';
import { elementEvidence, logDetectorResult } from './helpers';
import type { Detector, DetectorContext, DetectorScanResult } from './types';

const STOP_TEXTS = {
  en: ['stop', 'stop run', 'cancel run'],
  ru: ['остановить', 'прервать'],
} as const;

const STOP_SELECTORS = ['button', '[role="button"]', 'a[href]'] as const;

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function includesStopText(text: string, locale: 'en' | 'ru'): boolean {
  const normalized = normalise(text);
  const candidates = STOP_TEXTS[locale];
  return candidates.some((candidate) => normalized.includes(candidate));
}

function elementMatchesLocale(element: Element, locale: 'en' | 'ru'): boolean {
  const text = element.textContent ?? '';
  if (text && includesStopText(text, locale)) {
    return true;
  }
  if (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement) {
    const title = element.getAttribute('title');
    if (title && includesStopText(title, locale)) {
      return true;
    }
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && includesStopText(ariaLabel, locale)) {
      return true;
    }
  }
  const dataTestId = element.getAttribute('data-testid');
  if (dataTestId && dataTestId.toLowerCase().includes('codex-stop')) {
    return true;
  }
  return false;
}

function findTaskKey(element: Element): string | undefined {
  let current: Element | null = element;
  const seen = new Set<Element>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const taskId =
      current.getAttribute('data-task-id') ??
      current.getAttribute('data-id') ??
      current.getAttribute('data-reactid');
    if (taskId) {
      return taskId;
    }
    current = current.parentElement;
  }
  return undefined;
}

export class StopButtonDetector implements Detector {
  public readonly id = 'D2_STOP_BUTTON';

  private cache = new WeakSet<Element>();

  bootstrap(): void {
    this.cache = new WeakSet<Element>();
  }

  scan(context: DetectorContext): DetectorScanResult {
    const candidates = Array.from(
      context.root.querySelectorAll(STOP_SELECTORS.join(',')),
    );
    const matches = candidates.filter((element) => {
      if (this.cache.has(element)) {
        return true;
      }
      const matched = elementMatchesLocale(element, context.locale);
      if (matched) {
        this.cache.add(element);
      }
      return matched;
    });

    const signals: ContentScriptTasksUpdateSignal[] = matches.slice(0, 10).map((element, index) => ({
      detector: 'D2_STOP_BUTTON',
      evidence: `${elementEvidence(element)}#${index}`,
      ...(findTaskKey(element) ? { taskKey: findTaskKey(element) } : {}),
    }));
    const active = matches.length > 0;
    const count = active ? matches.length : 0;
    logDetectorResult(
      context.logger,
      this.id,
      active,
      count,
      signals.map((signal) => signal.evidence),
    );
    return { active, count, signals };
  }

  teardown(): void {
    this.cache = new WeakSet<Element>();
  }
}

export function createStopButtonDetector(): Detector {
  return new StopButtonDetector();
}
