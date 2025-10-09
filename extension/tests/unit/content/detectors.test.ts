import { describe, expect, it } from 'vitest';
import { ActivityScanner } from '../../../src/content/activity-scanner';
import { createDetectorPipeline } from '../../../src/content/detectors';
import { noopLogger } from '../../../src/shared/chrome';

describe('content detectors', () => {
  it('detects spinner activity', () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <div class="task-list">
        <div aria-busy="true" class="animate-spin"></div>
      </div>
    `;

    const pipeline = createDetectorPipeline({
      document,
      logger: noopLogger,
      enableCardHeuristic: false,
    });
    const scanner = new ActivityScanner(pipeline, noopLogger);
    const snapshot = scanner.scan(Date.now());

    expect(snapshot.active).toBe(true);
    expect(snapshot.count).toBeGreaterThanOrEqual(1);
    expect(snapshot.signals.some((signal) => signal.detector === 'D1_SPINNER')).toBe(
      true,
    );
  });

  it('detects stop buttons in English interface', () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <div class="task">
        <button class="btn">Stop</button>
        <button class="btn">Stop run</button>
      </div>
    `;

    const pipeline = createDetectorPipeline({
      document,
      logger: noopLogger,
      enableCardHeuristic: false,
    });
    const scanner = new ActivityScanner(pipeline, noopLogger);
    const snapshot = scanner.scan(Date.now());

    expect(snapshot.active).toBe(true);
    expect(snapshot.count).toBe(2);
    const stopSignals = snapshot.signals.filter((signal) => signal.detector === 'D2_STOP_BUTTON');
    expect(stopSignals).toHaveLength(2);
  });

  it('detects stop buttons in Russian interface', () => {
    document.documentElement.lang = 'ru';
    document.body.innerHTML = `
      <div class="task" data-task-id="abc123">
        <button class="btn">Остановить</button>
      </div>
    `;

    const pipeline = createDetectorPipeline({
      document,
      logger: noopLogger,
      enableCardHeuristic: false,
    });
    const scanner = new ActivityScanner(pipeline, noopLogger);
    const snapshot = scanner.scan(Date.now());

    expect(snapshot.active).toBe(true);
    expect(snapshot.count).toBe(1);
    const signal = snapshot.signals.find((item) => item.detector === 'D2_STOP_BUTTON');
    expect(signal?.taskKey).toBe('abc123');
  });

  it('resets detector pipeline caches on reset', () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `<button class="btn">Stop</button>`;

    const pipeline = createDetectorPipeline({
      document,
      logger: noopLogger,
      enableCardHeuristic: false,
    });
    const scanner = new ActivityScanner(pipeline, noopLogger);

    const initialSnapshot = scanner.scan(Date.now());
    expect(initialSnapshot.active).toBe(true);
    expect(initialSnapshot.count).toBe(1);

    const button = document.querySelector('button');
    expect(button).not.toBeNull();
    if (button) {
      button.textContent = 'Resume';
    }

    const cachedSnapshot = scanner.scan(Date.now());
    expect(cachedSnapshot.active).toBe(true);
    expect(cachedSnapshot.count).toBe(1);

    pipeline.reset();
    const afterResetSnapshot = scanner.scan(Date.now());
    expect(afterResetSnapshot.active).toBe(false);
    expect(afterResetSnapshot.count).toBe(0);
  });

  it('reports card heuristic enable flag in debug output', () => {
    const records: Array<{ enabled: boolean }> = [];
    const logger = {
      debug: (...args: unknown[]) => {
        if (args[0] === 'D3_CARD_HEUR disabled' && typeof args[1] === 'string') {
          try {
            const payload = JSON.parse(args[1] as string) as { enabled?: boolean };
            if (typeof payload.enabled === 'boolean') {
              records.push({ enabled: payload.enabled });
            }
          } catch {
            // ignore malformed payloads
          }
        }
      },
      info: noopLogger.info,
      warn: noopLogger.warn,
      error: noopLogger.error,
    };

    document.documentElement.lang = 'en';
    document.body.innerHTML = '<main></main>';

    const disabledPipeline = createDetectorPipeline({
      document,
      logger,
      enableCardHeuristic: false,
    });
    const disabledDetector = disabledPipeline.detectors.find(
      (detector) => detector.id === 'D3_CARD_HEUR',
    );
    expect(disabledDetector).toBeDefined();
    disabledDetector?.scan(disabledPipeline.createContext(Date.now()));

    const enabledPipeline = createDetectorPipeline({
      document,
      logger,
      enableCardHeuristic: true,
    });
    const enabledDetector = enabledPipeline.detectors.find(
      (detector) => detector.id === 'D3_CARD_HEUR',
    );
    expect(enabledDetector).toBeDefined();
    enabledDetector?.scan(enabledPipeline.createContext(Date.now()));

    expect(records).toContainEqual({ enabled: false });
    expect(records).toContainEqual({ enabled: true });
  });
});
