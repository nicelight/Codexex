import {
  assertContentScriptHeartbeat,
  assertContentScriptTasksUpdate,
} from '../shared/contracts';
import {
  createChildLogger,
  createLogger,
  resolveChrome,
  type ChromeLike,
  type ChromeLogger,
} from '../shared/chrome';
import { initializeAggregator, type BackgroundAggregator } from './aggregator';
import { registerAlarms } from './alarms';
import { initializeNotifications } from './notifications';

const VERBOSE_KEY = 'codex.tasks.verbose';

const chrome = resolveChrome();
const { logger: rootLogger } = createVerbosityAwareLogger(chrome);
const aggregator = initializeAggregator({ chrome, logger: rootLogger });

initializeNotifications(aggregator, { chrome, logger: rootLogger });
registerAlarms(aggregator, { chrome, logger: rootLogger });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(aggregator, createChildLogger(rootLogger, 'runtime'), message, sender)
    .catch((error) => {
      rootLogger.error('message handling failed', error);
    })
    .finally(() => {
      try {
        sendResponse();
      } catch (error) {
        rootLogger.warn('sendResponse failed', error);
      }
    });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void aggregator.handleTabRemoved(tabId).catch((error) => {
    rootLogger.error('tab removal handling failed', { tabId, error });
  });
});

export async function handleRuntimeMessage(
  aggregatorRef: BackgroundAggregator,
  logger: ChromeLogger,
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  if (!message || typeof message !== 'object') {
    return;
  }
  const { type } = message as { type?: unknown };
  if (type === 'TASKS_UPDATE') {
    try {
      assertContentScriptTasksUpdate(message);
    } catch (error) {
      logger.warn('invalid TASKS_UPDATE payload', error);
      return;
    }
    await aggregatorRef.handleTasksUpdate(message, sender);
    return;
  }
  if (type === 'TASKS_HEARTBEAT') {
    try {
      assertContentScriptHeartbeat(message);
    } catch (error) {
      logger.warn('invalid TASKS_HEARTBEAT payload', error);
      return;
    }
    await aggregatorRef.handleHeartbeat(message, sender);
    return;
  }
  logger.debug('unknown message type ignored', { type });
}

function createVerbosityAwareLogger(chromeRef: ChromeLike): { logger: ChromeLogger } {
  let verbose = false;
  const consoleLike = {
    debug: (...args: unknown[]) => {
      if (verbose) {
        console.debug(...args);
      }
    },
    info: (...args: unknown[]) => console.info(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args),
  } satisfies Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
  const logger = createLogger('codex-background', consoleLike);

  void refreshVerboseFlag();

  chromeRef.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session') {
      return;
    }
    const change = changes[VERBOSE_KEY];
    if (!change) {
      return;
    }
    const nextVerbose = Boolean(change.newValue);
    if (nextVerbose === verbose) {
      return;
    }
    verbose = nextVerbose;
    logger.info('verbose flag toggled', { verbose });
  });

  async function refreshVerboseFlag(): Promise<void> {
    try {
      const result = await chromeRef.storage.session.get({ [VERBOSE_KEY]: false });
      const nextVerbose = Boolean(result[VERBOSE_KEY]);
      if (nextVerbose !== verbose) {
        verbose = nextVerbose;
        logger.info('verbose flag toggled', { verbose });
      }
    } catch (error) {
      console.warn('failed to read verbose flag', error);
    }
  }

  return { logger };
}
