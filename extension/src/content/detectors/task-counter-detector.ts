import type { ContentScriptTasksUpdateSignal } from '../../shared/contracts';
import { elementEvidence, logDetectorResult } from './helpers';
import type { Detector, DetectorContext, DetectorScanResult } from './types';

const COUNTER_CONTAINER_SELECTOR =
  'div.absolute.inset-0.flex.items-center.justify-center';

function parseCounterValue(element: Element): number | undefined {
  const text = element.textContent?.trim();
  if (!text) {
    return undefined;
  }
  const match = text.match(/\d+/);
  if (!match) {
    return undefined;
  }
  return Number.parseInt(match[0] ?? '', 10);
}

export class TaskCounterDetector implements Detector {
  public readonly id = 'D4_TASK_COUNTER';

  scan(context: DetectorContext): DetectorScanResult {
    const containers = Array.from(
      context.root.querySelectorAll(COUNTER_CONTAINER_SELECTOR),
    );
    let detectedCount = 0;
    const signals: ContentScriptTasksUpdateSignal[] = [];

    containers.forEach((container, index) => {
      const candidate = parseCounterValue(container);
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        detectedCount = Math.max(detectedCount, candidate);
        signals.push({
          detector: this.id,
          evidence: `${elementEvidence(container)}#${index}`,
        });
      }
    });

    const active = detectedCount > 0;
    logDetectorResult(
      context.logger,
      this.id,
      active,
      detectedCount,
      signals.map((signal) => signal.evidence),
    );

    return { active, count: detectedCount, signals };
  }
}

export function createTaskCounterDetector(): Detector {
  return new TaskCounterDetector();
}
