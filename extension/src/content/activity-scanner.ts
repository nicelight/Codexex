import type { ContentScriptTasksUpdateSignal } from '../shared/contracts';
import { createChildLogger, type ChromeLogger } from '../shared/chrome';
import type { DetectorPipeline } from './detectors';
import type { DetectorScanResult } from './detectors/types';

export interface TaskActivitySnapshot {
  readonly active: boolean;
  readonly count: number;
  readonly signals: ContentScriptTasksUpdateSignal[];
  readonly ts: number;
}

export class ActivityScanner {
  private readonly logger: ChromeLogger;

  constructor(
    private readonly pipeline: DetectorPipeline,
    parentLogger: ChromeLogger,
  ) {
    this.logger = createChildLogger(parentLogger, 'scanner');
  }

  public reset(): void {
    this.logger.info('reset pipeline');
    this.pipeline.reset();
  }

  public scan(now: number): TaskActivitySnapshot {
    const context = this.pipeline.createContext(now);
    let active = false;
    let count = 0;
    const signals: ContentScriptTasksUpdateSignal[] = [];

    for (const detector of this.pipeline.detectors) {
      const result = detector.scan(context);
      active = active || result.active;
      count = Math.max(count, result.count);
      mergeSignals(signals, result);
    }

    const snapshot: TaskActivitySnapshot = {
      active,
      count,
      signals,
      ts: now,
    };
    this.logger.debug('scan result', snapshot);
    return snapshot;
  }
}

function mergeSignals(
  accumulator: ContentScriptTasksUpdateSignal[],
  result: DetectorScanResult,
): void {
  for (const signal of result.signals) {
    const duplicate = accumulator.find(
      (existing) =>
        existing.detector === signal.detector &&
        existing.evidence === signal.evidence &&
        existing.taskKey === signal.taskKey,
    );
    if (!duplicate) {
      accumulator.push(signal);
    }
  }
}
