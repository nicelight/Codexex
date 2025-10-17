import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { ContentScriptTasksUpdate } from '../../../src/shared/contracts';
import {
  createMockChrome,
  setChromeInstance,
  type ChromeMock,
} from '../../../src/shared/chrome';
import { initializeAggregator } from '../../../src/background/aggregator';
import { initializeNotifications } from '../../../src/background/notifications';
import { initializeSettingsController } from '../../../src/background/settings-controller';

describe('background notifications', () => {
  let chromeMock: ChromeMock;
  let currentTime: number;

  beforeEach(() => {
    vi.useFakeTimers();
    chromeMock = createMockChrome();
    setChromeInstance(chromeMock);
    currentTime = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    setChromeInstance(undefined);
  });

  function createAggregatorInstance(options: Partial<Parameters<typeof initializeAggregator>[0]> = {}) {
    const settings = initializeSettingsController({ chrome: chromeMock });
    const aggregator = initializeAggregator({ chrome: chromeMock, ...options, settings });
    return aggregator;
  }

  it('creates a notification after the debounce window elapses', async () => {
    const aggregator = createAggregatorInstance({ now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 1, title: 'Codex' } } as chrome.runtime.MessageSender;
    const makeUpdate = (count: number, ts: number): ContentScriptTasksUpdate => ({
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: count > 0,
      count,
      signals: [],
      ts,
    });

    await aggregator.handleTasksUpdate(makeUpdate(1, 1_000), sender);
    currentTime = 2_000;
    await aggregator.handleTasksUpdate(makeUpdate(0, 2_000), sender);

    const createSpy = vi.spyOn(chromeMock.notifications, 'create');
    const controller = initializeNotifications(aggregator, {
      chrome: chromeMock,
    });

    currentTime = 14_000;
    await vi.advanceTimersByTimeAsync(12_000);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const snapshot = await aggregator.getSnapshot();
    expect(snapshot.debounce.since).toBe(0);

    controller.dispose();
  });

  it('cancels notification timer when activity resumes', async () => {
    const aggregator = createAggregatorInstance({ now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 5, title: 'Codex' } } as chrome.runtime.MessageSender;
    const makeUpdate = (count: number, ts: number): ContentScriptTasksUpdate => ({
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: count > 0,
      count,
      signals: [],
      ts,
    });

    await aggregator.handleTasksUpdate(makeUpdate(1, 500), sender);
    currentTime = 1_500;
    await aggregator.handleTasksUpdate(makeUpdate(0, 1_500), sender);

    const createSpy = vi.spyOn(chromeMock.notifications, 'create');
    const controller = initializeNotifications(aggregator, {
      chrome: chromeMock,
    });

    currentTime = 2_000;
    await aggregator.handleTasksUpdate(makeUpdate(2, 2_000), sender);

    await vi.runOnlyPendingTimersAsync();
    expect(createSpy).not.toHaveBeenCalled();

    controller.dispose();
  });

  it('clears existing notifications when tasks become active again', async () => {
    const aggregator = createAggregatorInstance({ now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 9, title: 'Codex' } } as chrome.runtime.MessageSender;
    const makeUpdate = (count: number, ts: number): ContentScriptTasksUpdate => ({
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: count > 0,
      count,
      signals: [],
      ts,
    });

    await aggregator.handleTasksUpdate(makeUpdate(1, 1_000), sender);
    currentTime = 2_000;
    await aggregator.handleTasksUpdate(makeUpdate(0, 2_000), sender);

    const createSpy = vi.spyOn(chromeMock.notifications, 'create');
    const clearSpy = vi.spyOn(chromeMock.notifications, 'clear');

    const controller = initializeNotifications(aggregator, {
      chrome: chromeMock,
    });

    currentTime = 14_000;
    await vi.advanceTimersByTimeAsync(12_000);
    expect(createSpy).toHaveBeenCalledTimes(1);

    currentTime = 15_000;
    await aggregator.handleTasksUpdate(makeUpdate(3, 15_000), sender);
    await vi.runOnlyPendingTimersAsync();

    expect(clearSpy).toHaveBeenCalled();

    controller.dispose();
  });

  it('uses localized strings from i18n when scheduling notifications', async () => {
    chromeMock.i18n.getUILanguage = () => 'ru-RU';
    const aggregator = createAggregatorInstance({ now: () => currentTime });
    await aggregator.ready;

    const sender = { tab: { id: 11, title: 'Codex' } } as chrome.runtime.MessageSender;
    const makeUpdate = (count: number, ts: number): ContentScriptTasksUpdate => ({
      type: 'TASKS_UPDATE',
      origin: 'https://chatgpt.com/codex',
      active: count > 0,
      count,
      signals: [],
      ts,
    });

    await aggregator.handleTasksUpdate(makeUpdate(2, 2_000), sender);
    currentTime = 3_000;
    await aggregator.handleTasksUpdate(makeUpdate(0, 3_000), sender);

    const createSpy = vi.spyOn(chromeMock.notifications, 'create');
    const controller = initializeNotifications(aggregator, {
      chrome: chromeMock,
    });

    currentTime = 16_000;
    await vi.advanceTimersByTimeAsync(12_000);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.mock.calls[0]?.[1];
    expect(payload).toMatchObject({
      message: 'Все задачи Codex завершены',
      buttons: [{ title: 'ОК' }],
    });

    controller.dispose();
  });
});
