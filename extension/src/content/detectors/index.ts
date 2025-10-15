import type { ChromeLogger } from '../../shared/chrome';
import { detectLocale } from './helpers';
import { createCardHeuristicDetector } from './card-heuristic-detector';
import { createSpinnerDetector } from './spinner-detector';
import { createStopButtonDetector } from './stop-button-detector';
import { createTaskCounterDetector } from './task-counter-detector';
import type { Detector, DetectorContext } from './types';

export interface DetectorFactoryOptions {
  readonly document: Document;
  readonly logger: ChromeLogger;
  readonly enableCardHeuristic?: boolean;
}

export interface DetectorPipeline {
  readonly detectors: Detector[];
  createContext(now: number): DetectorContext;
  reset(): void;
}

export function createDetectorPipeline(options: DetectorFactoryOptions): DetectorPipeline {
  const detectors: Detector[] = [
    createTaskCounterDetector(),
    createSpinnerDetector(),
    createStopButtonDetector(),
    createCardHeuristicDetector({ enabled: Boolean(options.enableCardHeuristic) }),
  ];

  let locale = detectLocale(options.document);

  const createContext = (now: number): DetectorContext => {
    locale = detectLocale(options.document);
    return {
      document: options.document,
      root: options.document.documentElement,
      locale,
      now,
      logger: options.logger,
    };
  };

  const reset = () => {
    for (const detector of detectors) {
      detector.teardown?.();
      detector.bootstrap?.(createContext(Date.now()));
    }
  };

  reset();

  return {
    detectors,
    createContext,
    reset,
  };
}
