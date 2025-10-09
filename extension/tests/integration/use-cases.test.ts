import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentScriptRuntime } from '@/content/runtime';
import { initializeAggregator } from '@/background/aggregator';
import { initializeNotifications } from '@/background/notifications';
import { registerAlarms } from '@/background/alarms';
import type { ChromeMock } from '@/shared/chrome';
import { createBackgroundBridge } from '../support/background-bridge';
import {
  type ChromeTestEnvironment,
  advanceTimersByTime,
  setupChromeTestEnvironment,
} from '../support/environment';

describe('integration use-cases', () => {
  let chromeMock: ChromeMock;
  let env: ChromeTestEnvironment;

  beforeEach(() => {
    env = setupChromeTestEnvironment({
      installFakeTimers: true,
      overrides: {
        i18n: { getUILanguage: () => 'en-US' },
      },
    });
    chromeMock = env.chrome;
  });

  afterEach(() => {
    env.restore();
  });

  it('delivers notification when all tasks finish after debounce window', async () => {
    const aggregator = initializeAggregator({ chrome: chromeMock });
    await aggregator.ready;

    const notifications = initializeNotifications(aggregator, { chrome: chromeMock });
    const bridge = createBackgroundBridge(chromeMock, aggregator, {
      tabId: 10,
      tabTitle: 'Codex Tasks',
    });

    const notificationCreate = vi.spyOn(chromeMock.notifications, 'create');

    const runtime = new ContentScriptRuntime({ window });
    await runtime.start();
    await vi.runOnlyPendingTimersAsync();

    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <div class="task-list">
        <button>Stop</button>
        <div aria-busy="true" class="spinner"></div>
      </div>
    `;
    document.body.appendChild(document.createElement('span'));
    await advanceTimersByTime(20);
    await vi.runOnlyPendingTimersAsync();

    let snapshot = await aggregator.getSnapshot();
    expect(snapshot.lastTotal).toBeGreaterThan(0);

    document.body.innerHTML = '';
    document.body.appendChild(document.createElement('span'));
    await advanceTimersByTime(1_500);

    snapshot = await aggregator.getSnapshot();
    expect(snapshot.debounce.since).toBeGreaterThan(0);

    await advanceTimersByTime(12_000);

    expect(notificationCreate).toHaveBeenCalledTimes(1);
    snapshot = await aggregator.getSnapshot();
    expect(snapshot.debounce.since).toBe(0);
    expect(snapshot.lastTotal).toBe(0);

    runtime.destroy();
    bridge.disconnect();
    notifications.dispose();
  });

  it('recovers from missed heartbeat after alarm-triggered ping', async () => {
    const aggregator = initializeAggregator({ chrome: chromeMock });
    await aggregator.ready;

    const bridge = createBackgroundBridge(chromeMock, aggregator, {
      tabId: 42,
      tabTitle: 'Codex Heartbeat',
    });
    const alarms = registerAlarms(aggregator, { chrome: chromeMock });

    const pingSpy = vi.spyOn(chromeMock.tabs, 'sendMessage');

    const runtime = new ContentScriptRuntime({ window });
    await runtime.start();
    await vi.runOnlyPendingTimersAsync();

    const runtimeInternals = runtime as unknown as {
      heartbeatTimer?: ReturnType<typeof setTimeout>;
      scheduleHeartbeat: () => void;
    };
    if (runtimeInternals.heartbeatTimer) {
      clearTimeout(runtimeInternals.heartbeatTimer);
      runtimeInternals.heartbeatTimer = undefined;
    }
    runtimeInternals.scheduleHeartbeat = () => undefined;

    let snapshot = await aggregator.getSnapshot();
    expect(Object.keys(snapshot.tabs)).toContain('42');
    const initialHeartbeatTs = snapshot.tabs['42'].heartbeat.lastReceivedAt;

    await advanceTimersByTime(46_000);
    chromeMock.__events.alarms.onAlarm.emit({ name: 'codex-poll' } as chrome.alarms.Alarm);
    await vi.runOnlyPendingTimersAsync();

    expect(pingSpy).toHaveBeenCalled();
    const [targetTabId, payload] = pingSpy.mock.calls[0]!;
    expect(targetTabId).toBe(42);
    expect(payload).toEqual({ type: 'PING' });

    snapshot = await aggregator.getSnapshot();
    expect(snapshot.tabs['42'].heartbeat.status).toBe('OK');
    expect(snapshot.tabs['42'].heartbeat.lastReceivedAt).toBeGreaterThan(initialHeartbeatTs);
    expect(snapshot.tabs['42'].heartbeat.missedCount).toBe(0);

    runtime.destroy();
    bridge.disconnect();
    alarms.dispose();
  });
});
