import { beforeEach, describe, expect, it } from 'vitest';
import { ActivityScanner } from '../../../src/content/activity-scanner';
import { noopLogger } from '../../../src/shared/chrome';

function createScanner(): ActivityScanner {
  return new ActivityScanner({ document, logger: noopLogger });
}

describe('ActivityScanner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.lang = 'en';
  });

  it('detects spinner elements', () => {
    document.body.innerHTML = `
      <div class="task-list">
        <div aria-busy="true" class="animate-spin"></div>
      </div>
    `;

    const snapshot = createScanner().scan(Date.now());

    expect(snapshot.active).toBe(true);
    expect(snapshot.count).toBeGreaterThanOrEqual(1);
    expect(snapshot.signals.some((signal) => signal.detector === 'D1_SPINNER')).toBe(true);
  });

  it('extracts counter values from task details spinner', () => {
    document.body.innerHTML = `
      <div class="relative size-6">
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-xs">5</span>
        </div>
      </div>
    `;

    const snapshot = createScanner().scan(Date.now());

    expect(snapshot.active).toBe(true);
    expect(snapshot.count).toBe(5);
    expect(snapshot.signals.some((signal) => signal.detector === 'D4_TASK_COUNTER')).toBe(true);
  });

  it('detects stop buttons using text and aria-label', () => {
    document.body.innerHTML = `
      <div class="task" data-task-id="foo">
        <button class="btn">Stop</button>
        <button class="btn" aria-label="Cancel task"></button>
      </div>
    `;

    const snapshot = createScanner().scan(Date.now());

    expect(snapshot.active).toBe(true);
    const stopSignals = snapshot.signals.filter((signal) => signal.detector === 'D2_STOP_BUTTON');
    expect(stopSignals).toHaveLength(2);
    stopSignals.forEach((signal) => {
      expect(signal.taskKey).toBe('foo');
    });
  });

  it('supports russian stop button labels', () => {
    document.documentElement.lang = 'ru';
    document.body.innerHTML = `
      <div class="task" data-task-id="ru-task">
        <button class="btn">Отменить задачу</button>
      </div>
    `;

    const snapshot = createScanner().scan(Date.now());

    expect(snapshot.active).toBe(true);
    const signal = snapshot.signals.find((item) => item.detector === 'D2_STOP_BUTTON');
    expect(signal?.taskKey).toBe('ru-task');
  });

  it('ignores stop signals with listing group task keys', () => {
    document.body.innerHTML = `
      <div class="task" data-id="lg#0">
        <button class="btn">Stop</button>
      </div>
      <div class="task" data-task-id="real-task">
        <button class="btn">Cancel</button>
      </div>
    `;

    const snapshot = createScanner().scan(Date.now());

    const stopSignals = snapshot.signals.filter((signal) => signal.detector === 'D2_STOP_BUTTON');
    expect(stopSignals).toHaveLength(1);
    expect(stopSignals[0]?.taskKey).toBe('real-task');
  });

  it('keeps stop signals when listing group prefix has task suffix', () => {
    document.body.innerHTML = `
      <div class="task" data-task-id="lg#0#real">
        <button class="btn">Stop</button>
      </div>
    `;

    const snapshot = createScanner().scan(Date.now());

    const stopSignals = snapshot.signals.filter((signal) => signal.detector === 'D2_STOP_BUTTON');
    expect(stopSignals).toHaveLength(1);
    expect(stopSignals[0]?.taskKey).toBe('lg#0#real');
  });

  it('ignores stop signals located inside listing group containers', () => {
    document.body.innerHTML = `
      <div id="lg#2">
        <button class="btn">Stop</button>
      </div>
      <div class="task" data-task-id="real-task">
        <button class="btn">Cancel</button>
      </div>
    `;

    const snapshot = createScanner().scan(Date.now());

    const stopSignals = snapshot.signals.filter((signal) => signal.detector === 'D2_STOP_BUTTON');
    expect(stopSignals).toHaveLength(1);
    expect(stopSignals[0]?.taskKey).toBe('real-task');
  });

  it('ignores hidden and disabled stop controls', () => {
    document.body.innerHTML = `
      <div class="task" data-task-id="hidden" hidden>
        <button class="btn">Stop</button>
      </div>
      <div class="task" data-task-id="style-hidden">
        <button class="btn" style="display: none;">Stop</button>
      </div>
      <div class="task" data-task-id="aria-hidden">
        <button class="btn" aria-hidden="true">Stop</button>
      </div>
      <div class="task" data-task-id="disabled">
        <button class="btn" disabled>Cancel</button>
        <button class="btn" aria-disabled="true">Cancel task</button>
      </div>
    `;

    const snapshot = createScanner().scan(Date.now());

    expect(snapshot.active).toBe(false);
    expect(snapshot.count).toBe(0);
  });
});
