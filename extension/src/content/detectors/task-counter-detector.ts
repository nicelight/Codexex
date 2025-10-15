import type { ContentScriptTasksUpdateSignal } from '../../shared/contracts';
import { elementEvidence, logDetectorResult } from './helpers';
import type { Detector, DetectorContext, DetectorScanResult } from './types';

const COUNTER_SELECTOR =
  'div.absolute.inset-0.flex.items-center.justify-center > span.text-xs';
const REQUIRED_CONTAINER_CLASSES = [
  'absolute',
  'inset-0',
  'flex',
  'items-center',
  'justify-center',
] as const;

function isTaskCounterSpan(element: Element): element is HTMLSpanElement {
  if (!(element instanceof HTMLSpanElement)) {
    return false;
  }
  const container = element.parentElement;
  if (!container) {
    return false;
  }
  return REQUIRED_CONTAINER_CLASSES.every((className) =>
    container.classList.contains(className),
  );
}

function parseCounterValue(span: HTMLSpanElement): number | undefined {
  const raw = span.textContent?.trim();
  if (!raw) {
    return undefined;
  }
  const digits = raw.match(/\d+/);
  if (!digits) {
    return undefined;
  }
  const value = Number.parseInt(digits[0] ?? '', 10);
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function hasSpinnerDecoration(span: HTMLSpanElement): boolean {
  const container = span.parentElement;
  if (!container) {
    return false;
  }
  const spinner = container.querySelector(
    'svg.animate-spin, svg [class*="animate-spin"], svg animateTransform',
  );
  return Boolean(spinner);
}

export class TaskCounterDetector implements Detector {
  public readonly id = 'D4_TASK_COUNTER';

  scan(context: DetectorContext): DetectorScanResult {
    const spans = Array.from(
      context.document.querySelectorAll<HTMLSpanElement>(COUNTER_SELECTOR),
    ).filter((candidate): candidate is HTMLSpanElement =>
      isTaskCounterSpan(candidate),
    );

    const annotated = spans
      .map((span) => {
        const value = parseCounterValue(span);
        if (typeof value !== 'number' || !hasSpinnerDecoration(span)) {
          return undefined;
        }
        return { span, value };
      })
      .filter(
        (item): item is { span: HTMLSpanElement; value: number } => Boolean(item),
      );

    if (annotated.length === 0) {
      logDetectorResult(context.logger, this.id, false, 0, []);
      return { active: false, count: 0, signals: [] };
    }

    const count = annotated.reduce(
      (max, item) => (item.value > max ? item.value : max),
      0,
    );
    const signals: ContentScriptTasksUpdateSignal[] = annotated
      .slice(0, 3)
      .map((item, index) => ({
        detector: this.id,
        evidence: `${elementEvidence(
          item.span.parentElement ?? item.span,
        )}#${index}:${item.value}`,
      }));

    logDetectorResult(
      context.logger,
      this.id,
      count > 0,
      count,
      signals.map((signal) => signal.evidence),
    );

    return {
      active: count > 0,
      count,
      signals,
    };
  }
}

export function createTaskCounterDetector(): Detector {
  return new TaskCounterDetector();
}
