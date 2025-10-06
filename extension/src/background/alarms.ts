import {
  createChildLogger,
  createLogger,
  resolveChrome,
  type AlarmListener,
  type ChromeLike,
  type ChromeLogger,
} from '../shared/chrome';
import type { AggregatedTabsState } from '../shared/contracts';
import type { BackgroundAggregator } from './aggregator';

const ALARM_NAME = 'codex-poll';
const ALARM_PERIOD_MINUTES = 1;

export interface AlarmsOptions {
  readonly chrome?: ChromeLike;
  readonly logger?: ChromeLogger;
}

export interface AlarmsController {
  dispose(): void;
}

export function registerAlarms(
  aggregator: BackgroundAggregator,
  options: AlarmsOptions = {},
): AlarmsController {
  const chrome = options.chrome ?? resolveChrome();
  const baseLogger = options.logger ?? createLogger('codex-background');
  const logger = createChildLogger(baseLogger, 'alarms');

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  logger.info('alarm scheduled', { name: ALARM_NAME, periodMinutes: ALARM_PERIOD_MINUTES });

  const protectedTabs = new Set<number>();

  const unsubscribe = aggregator.onStateChange((event) => {
    void ensureAutoDiscardable(event.current).catch((error) => {
      logger.warn('failed to enforce autoDiscardable', error);
    });
    if (event.reason === 'tab-removed' && typeof event.tabId === 'number') {
      protectedTabs.delete(event.tabId);
    }
  });

  void aggregator.ready
    .then(() => aggregator.getSnapshot())
    .then((snapshot) => ensureAutoDiscardable(snapshot))
    .catch((error) => {
      logger.error('failed to apply autoDiscardable on startup', error);
    });

  const alarmListener: AlarmListener = (alarm) => {
    if (alarm.name !== ALARM_NAME) {
      return;
    }
    void handleAlarmTick().catch((error) => {
      logger.error('alarm tick failed', error);
    });
  };

  chrome.alarms.onAlarm.addListener(alarmListener);

  return {
    dispose() {
      chrome.alarms.onAlarm.removeListener(alarmListener);
      unsubscribe();
      protectedTabs.clear();
    },
  };

  async function ensureAutoDiscardable(state: AggregatedTabsState): Promise<void> {
    for (const tabId of Object.keys(state.tabs).map(Number)) {
      if (protectedTabs.has(tabId)) {
        continue;
      }
      try {
        await chrome.tabs.update(tabId, { autoDiscardable: false });
        protectedTabs.add(tabId);
        logger.debug('autoDiscardable disabled', { tabId });
      } catch (error) {
        logger.warn('autoDiscardable update failed', { tabId, error });
      }
    }
    for (const tabId of Array.from(protectedTabs)) {
      if (!state.tabs[String(tabId)]) {
        protectedTabs.delete(tabId);
      }
    }
  }

  async function handleAlarmTick(): Promise<void> {
    logger.debug('alarm tick');
    const staleTabIds = await aggregator.evaluateHeartbeatStatuses();
    if (staleTabIds.length === 0) {
      return;
    }
    for (const tabId of staleTabIds) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        logger.info('ping sent to tab', { tabId });
      } catch (error) {
        logger.warn('failed to ping tab', { tabId, error });
      }
    }
  }
}
