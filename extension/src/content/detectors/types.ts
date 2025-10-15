import type { ContentScriptTasksUpdateSignal } from '../../shared/contracts';
import type { ChromeLogger } from '../../shared/chrome';

export type DetectorId =
  | 'D1_SPINNER'
  | 'D2_STOP_BUTTON'
  | 'D3_CARD_HEUR'
  | 'D4_TASK_COUNTER';

export interface DetectorContext {
  readonly document: Document;
  readonly root: Element | Document;
  readonly locale: 'en' | 'ru';
  readonly now: number;
  readonly logger: ChromeLogger;
}

export interface DetectorScanResult {
  readonly active: boolean;
  readonly count: number;
  readonly signals: ContentScriptTasksUpdateSignal[];
}

export interface Detector {
  readonly id: DetectorId;
  bootstrap?(context: DetectorContext): void;
  scan(context: DetectorContext): DetectorScanResult;
  teardown?(): void;
}
