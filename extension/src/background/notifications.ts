import type { AggregatedTabsState } from '../shared/contracts';
import {
  createChildLogger,
  createLogger,
  resolveChrome,
  type ChromeLike,
  type ChromeLogger,
} from '../shared/chrome';
import { resolveLocale } from '../shared/locale';
import type { BackgroundAggregator } from './aggregator';

const NOTIFICATION_ID = 'codex-tasks-zero';

interface NotificationStrings {
  readonly title: string;
  readonly message: string;
  readonly buttonOk: string;
}

const STRINGS: Record<'en' | 'ru', NotificationStrings> = {
  en: {
    title: 'Codex',
    message: 'All Codex tasks are complete',
    buttonOk: 'OK',
  },
  ru: {
    title: 'Codex',
    message: 'Все задачи в Codex завершены',
    buttonOk: 'ОК',
  },
};

export interface NotificationsOptions {
  readonly chrome?: ChromeLike;
  readonly logger?: ChromeLogger;
  readonly now?: () => number;
}

export interface NotificationsController {
  dispose(): void;
}

export function initializeNotifications(
  aggregator: BackgroundAggregator,
  options: NotificationsOptions = {},
): NotificationsController {
  const chrome = options.chrome ?? resolveChrome();
  const baseLogger = options.logger ?? createLogger('codex-background');
  const logger = createChildLogger(baseLogger, 'notifications');
  const now = options.now ?? (() => Date.now());
  const locale = resolveLocale(chrome);
  const strings = STRINGS[locale];

  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scheduledTarget = 0;
  let activeNotificationId: string | undefined;

  const unsubscribe = aggregator.onStateChange((event) => {
    if (disposed) {
      return;
    }
    handleStateSnapshot(event.current).catch((error) => {
      logger.error('state change handling failed', error);
    });
  });

  void aggregator.ready
    .then(() => aggregator.getSnapshot())
    .then((snapshot) => handleStateSnapshot(snapshot))
    .catch((error) => {
      logger.error('failed to read initial state', error);
    });

  return {
    dispose() {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      scheduledTarget = 0;
      unsubscribe();
    },
  };

  async function handleStateSnapshot(state: AggregatedTabsState): Promise<void> {
    if (disposed) {
      return;
    }
    if (state.lastTotal > 0) {
      cancelTimer();
      await clearNotification();
      return;
    }
    if (state.debounce.since === 0) {
      cancelTimer();
      return;
    }
    scheduleTimer(state);
  }

  function scheduleTimer(state: AggregatedTabsState): void {
    const target = state.debounce.since + state.debounce.ms;
    const current = now();
    if (current >= target) {
      void triggerNotification();
      return;
    }
    if (timer && scheduledTarget === target) {
      return;
    }
    cancelTimer();
    const delay = Math.max(0, target - current);
    scheduledTarget = target;
    timer = setTimeout(() => {
      timer = undefined;
      scheduledTarget = 0;
      void triggerNotification();
    }, delay);
    logger.debug('debounce timer scheduled', { delay, target });
  }

  function cancelTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    scheduledTarget = 0;
  }

  async function triggerNotification(): Promise<void> {
    if (disposed) {
      return;
    }
    const snapshot = await aggregator.getSnapshot();
    if (snapshot.debounce.since === 0) {
      logger.debug('debounce window already cleared');
      return;
    }
    const target = snapshot.debounce.since + snapshot.debounce.ms;
    const current = now();
    if (current < target) {
      logger.debug('debounce window not ready yet');
      scheduleTimer(snapshot);
      return;
    }
    if (snapshot.lastTotal !== 0 || !allCountsZero(snapshot)) {
      logger.info('activity detected during debounce, skipping notification');
      cancelTimer();
      return;
    }
    try {
      const notificationId = await chrome.notifications.create(NOTIFICATION_ID, {
        type: 'basic',
        title: strings.title,
        message: strings.message,
        iconUrl: 'assets/icon128.png',
        buttons: [{ title: strings.buttonOk }],
      });
      activeNotificationId = notificationId ?? NOTIFICATION_ID;
      logger.info('notification created', { notificationId: activeNotificationId });
    } catch (error) {
      logger.error('failed to create notification', error);
    } finally {
      cancelTimer();
      await aggregator.clearDebounceIfIdle();
    }
  }

  async function clearNotification(): Promise<void> {
    if (!activeNotificationId) {
      return;
    }
    try {
      await chrome.notifications.clear(activeNotificationId);
      logger.debug('notification cleared', { notificationId: activeNotificationId });
    } catch (error) {
      logger.warn('failed to clear notification', error);
    }
    activeNotificationId = undefined;
  }
}

function allCountsZero(state: AggregatedTabsState): boolean {
  return Object.values(state.tabs).every((tab) => tab.count === 0);
}
