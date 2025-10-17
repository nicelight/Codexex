import {
  createChildLogger,
  createLogger,
  resolveChrome,
  type AlarmListener,
  type ChromeLike,
  type ChromeLogger,
} from '../shared/chrome';
import type { AggregatedTabsState } from '../shared/contracts';
import type { BackgroundSettingsController } from './settings-controller';
import { SETTINGS_DEFAULTS } from '../shared/settings';
import type { BackgroundAggregator } from './aggregator';

const ALARM_NAME = 'codex-poll';
const ALARM_PERIOD_MINUTES = 1;

export interface AlarmsOptions {
  readonly chrome?: ChromeLike;
  readonly logger?: ChromeLogger;
  readonly settings?: BackgroundSettingsController;
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
  const settings = options.settings;

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  logger.info('alarm scheduled', { name: ALARM_NAME, periodMinutes: ALARM_PERIOD_MINUTES });

  const protectedTabs = new Set<number>();
  let autoDiscardableOff = settings?.getSnapshot().autoDiscardableOff ?? SETTINGS_DEFAULTS.autoDiscardableOff;
  const unsubscribeSettings = settings
    ? settings.onChange((next) => {
        autoDiscardableOff = next.autoDiscardableOff;
        void applyCurrentState();
      })
    : undefined;

  const unsubscribe = aggregator.onStateChange((event) => {
    void ensureAutoDiscardable(event.current).catch((error) => {
      logger.warn('failed to enforce autoDiscardable', error);
    });
    if (
      (event.reason === 'tab-removed' || event.reason === 'tab-navigated') &&
      typeof event.tabId === 'number'
    ) {
      void restoreAutoDiscardable(event.tabId);
    }
  });

  void aggregator.ready
    .then(() => applyCurrentState())
    .catch((error) => {
      logger.error('failed to apply autoDiscardable on startup', error);
    });

  if (settings) {
    void settings.ready
      .then(() => {
        autoDiscardableOff = settings.getSnapshot().autoDiscardableOff;
        return applyCurrentState();
      })
      .catch((error) => {
        logger.warn('failed to sync autoDiscardable settings', error);
      });
  } else {
    void applyCurrentState().catch((error) => {
      logger.warn('failed to apply autoDiscardable on initial snapshot', error);
    });
  }

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
      unsubscribeSettings?.();
    },
  };

  async function ensureAutoDiscardable(state: AggregatedTabsState): Promise<void> {
    if (autoDiscardableOff) {
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
      return;
    }
    for (const tabId of Array.from(protectedTabs)) {
      try {
        await chrome.tabs.update(tabId, { autoDiscardable: true });
        logger.debug('autoDiscardable restored', { tabId });
      } catch (error) {
        logger.warn('autoDiscardable restore failed', { tabId, error });
      }
      protectedTabs.delete(tabId);
    }
  }

  async function restoreAutoDiscardable(tabId: number): Promise<void> {
    if (!protectedTabs.has(tabId)) {
      return;
    }
    protectedTabs.delete(tabId);
    try {
      await chrome.tabs.update(tabId, { autoDiscardable: true });
      logger.debug('autoDiscardable restored', { tabId });
    } catch (error) {
      logger.warn('autoDiscardable restore failed', { tabId, error });
    }
  }

  async function applyCurrentState(): Promise<void> {
    const snapshot = await aggregator.getSnapshot();
    await ensureAutoDiscardable(snapshot);
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
