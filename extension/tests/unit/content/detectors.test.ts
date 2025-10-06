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
});
