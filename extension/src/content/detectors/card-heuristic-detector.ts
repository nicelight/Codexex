import type { Detector, DetectorContext, DetectorScanResult } from './types';

export interface CardHeuristicOptions {
  readonly enabled: boolean;
}

export class CardHeuristicDetector implements Detector {
  public readonly id = 'D3_CARD_HEUR';

  constructor(private readonly options: CardHeuristicOptions) {}

  scan(context: DetectorContext): DetectorScanResult {
    context.logger.debug(
      `${this.id} disabled`,
      JSON.stringify({ enabled: this.options.enabled }),
    );
    return { active: false, count: 0, signals: [] };
  }
}

export function createCardHeuristicDetector(options: CardHeuristicOptions): Detector {
  return new CardHeuristicDetector(options);
}
