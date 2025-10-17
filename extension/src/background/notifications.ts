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
  const locale = resolveLocale(chrome);
  const strings = STRINGS[locale];

  let disposed = false;
  let activeNotificationId: string | undefined;

  const unsubscribe = aggregator.onStateChange((event) => {
    if (disposed) {
      return;
    }
    if (event.current.lastTotal > 0) {
      void clearNotification();
    }
  });

  const unsubscribeIdle = aggregator.onIdleSettled((state) => {
    if (disposed) {
      return;
    }
    void triggerNotification(state).catch((error) => {
      logger.error('idle notification failed', error);
    });
  });

  void aggregator.ready
    .then(() => aggregator.getSnapshot())
    .then((snapshot) => {
      if (snapshot.lastTotal > 0) {
        return clearNotification();
      }
      return undefined;
    })
    .catch((error) => {
      logger.error('failed to read initial state', error);
    });

    return {
      dispose() {
        disposed = true;
        unsubscribe();
        unsubscribeIdle();
        void clearNotification();
      },
    };

  async function triggerNotification(state: AggregatedTabsState): Promise<void> {
    if (disposed) {
      return;
    }
    if (state.lastTotal !== 0 || !allCountsZero(state)) {
      logger.debug('notification skipped due to activity');
      return;
    }
    await clearNotification();
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
