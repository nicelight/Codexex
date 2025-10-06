import type { ContentScriptTasksUpdateSignal } from '../../shared/contracts';
import { elementEvidence, collectElements, logDetectorResult } from './helpers';
import type { Detector, DetectorContext, DetectorScanResult } from './types';

const SPINNER_SELECTORS = [
  '[aria-busy="true"]',
  '[role="progressbar"]',
  '.animate-spin',
  '.loading-spinner',
  'svg[role="img"] animateTransform',
] as const;

function uniqueElements(elements: readonly Element[]): Element[] {
  const seen = new Set<Element>();
  const result: Element[] = [];
  for (const element of elements) {
    if (!seen.has(element)) {
      seen.add(element);
      result.push(element);
    }
  }
  return result;
}

function buildSignals(elements: readonly Element[]): ContentScriptTasksUpdateSignal[] {
  return elements.slice(0, 5).map((element, index) => ({
    detector: 'D1_SPINNER',
    evidence: `${elementEvidence(element)}#${index}`,
  }));
}

export class SpinnerDetector implements Detector {
  public readonly id = 'D1_SPINNER';

  scan(context: DetectorContext): DetectorScanResult {
    const elements = uniqueElements(
      collectElements(context.root, SPINNER_SELECTORS),
    );
    const active = elements.length > 0;
    const count = active ? Math.max(1, elements.length) : 0;
    const signals = active ? buildSignals(elements) : [];
    logDetectorResult(
      context.logger,
      this.id,
      active,
      count,
      signals.map((signal) => signal.evidence),
    );
    return { active, count, signals };
  }
}

export function createSpinnerDetector(): Detector {
  return new SpinnerDetector();
}
