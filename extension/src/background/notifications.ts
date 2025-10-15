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
    message: 'Все задачи Codex завершены',
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
  let activeNotificationId: string | undefined;
  let lastSnapshot: AggregatedTabsState | undefined;

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
      unsubscribe();
    },
  };

  async function handleStateSnapshot(state: AggregatedTabsState): Promise<void> {
    if (disposed) {
      return;
    }
    lastSnapshot = state;
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
    cancelTimer();
    const target = state.debounce.since + state.debounce.ms;
    const delay = Math.max(0, target - now());
    if (delay === 0) {
      void triggerNotification();
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      void triggerNotification();
    }, delay);
    logger.debug('debounce timer scheduled', { delay, target });
  }

  function cancelTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  async function triggerNotification(): Promise<void> {
    if (disposed) {
      return;
    }
    if (!lastSnapshot || lastSnapshot.lastTotal > 0) {
      logger.debug('skipping notification due to recent activity');
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
      try {
        await aggregator.clearDebounceIfIdle();
      } catch (error) {
        logger.warn('failed to clear debounce state', error);
      }
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
