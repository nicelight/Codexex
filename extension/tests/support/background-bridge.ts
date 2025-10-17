import { assertContentScriptHeartbeat, assertContentScriptTasksUpdate } from '@/shared/contracts';
import type { ChromeLogger, ChromeMock } from '@/shared/chrome';
import type { BackgroundAggregator } from '@/background/aggregator';
import { generatePopupRenderState } from '@/background/popup-state';

type MessageHandler = (message: unknown, sender: chrome.runtime.MessageSender) => Promise<unknown>;

interface BridgeLogger extends ChromeLogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface BridgeOptions {
  readonly tabId: number;
  readonly tabTitle: string;
  readonly tabUrl?: string;
  readonly logger?: BridgeLogger;
}

export interface BackgroundBridge {
  readonly dispatch: MessageHandler;
  readonly disconnect: () => void;
}

function createDefaultLogger(): BridgeLogger {
  const log = () => undefined;
  return { debug: log, info: log, warn: log, error: log };
}

function normalizeSender(
  defaults: chrome.runtime.MessageSender,
  override?: chrome.runtime.MessageSender,
): chrome.runtime.MessageSender {
  if (!override) {
    return defaults;
  }
  return {
    ...defaults,
    ...override,
    tab: override.tab ?? defaults.tab,
  };
}

async function handleBackgroundMessage(
  aggregator: BackgroundAggregator,
  message: unknown,
  sender: chrome.runtime.MessageSender,
  logger: BridgeLogger,
): Promise<unknown> {
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  const { type } = message as { type?: unknown };
  if (type === 'TASKS_UPDATE') {
    try {
      assertContentScriptTasksUpdate(message);
    } catch (error) {
      logger.warn('invalid TASKS_UPDATE payload', error);
      return undefined;
    }
    await aggregator.handleTasksUpdate(message, sender);
    return undefined;
  }
  if (type === 'TASKS_HEARTBEAT') {
    try {
      assertContentScriptHeartbeat(message);
    } catch (error) {
      logger.warn('invalid TASKS_HEARTBEAT payload', error);
      return undefined;
    }
    await aggregator.handleHeartbeat(message, sender);
    return undefined;
  }
  if (type === 'POPUP_GET_STATE') {
    const state = await generatePopupRenderState(aggregator);
    logger.debug('popup state generated', { totalActive: state.totalActive });
    return state;
  }
  logger.debug('unknown message ignored', { type });
  return undefined;
}

export function createBackgroundBridge(
  chromeMock: ChromeMock,
  aggregator: BackgroundAggregator,
  options: BridgeOptions,
): BackgroundBridge {
  const logger = options.logger ?? createDefaultLogger();
  const tabUrl = options.tabUrl ?? 'https://codex.openai.com';
  const defaultSender: chrome.runtime.MessageSender = {
    tab: {
      id: options.tabId,
      title: options.tabTitle,
      url: tabUrl,
    },
  } as chrome.runtime.MessageSender;

  const originalSendMessage = chromeMock.runtime.sendMessage;
  const originalTabsSendMessage = chromeMock.tabs.sendMessage;

  const dispatch: MessageHandler = async (message, sender) => {
    const resolvedSender = normalizeSender(defaultSender, sender);
    try {
      return await handleBackgroundMessage(aggregator, message, resolvedSender, logger);
    } catch (error) {
      logger.error('background dispatch failed', error);
      return undefined;
    }
  };

  chromeMock.runtime.sendMessage = ((message: unknown, callback?: (response?: unknown) => void) => {
    void dispatch(message, defaultSender).then((response) => {
      callback?.(response);
    });
    return undefined as unknown;
  }) as typeof chrome.runtime.sendMessage;

  chromeMock.tabs.sendMessage = (async (
    ...args: Parameters<typeof chrome.tabs.sendMessage>
  ) => {
    const [tabId, payload, maybeOptionsOrCallback] = args;
    const callback =
      typeof maybeOptionsOrCallback === 'function'
        ? (maybeOptionsOrCallback as (response?: unknown) => void)
        : undefined;
    chromeMock.__events.runtime.onMessage.emit(
      payload,
      { tab: { id: typeof tabId === 'number' ? tabId : defaultSender.tab?.id } } as chrome.runtime.MessageSender,
      () => undefined,
    );
    callback?.();
    return undefined as unknown;
  }) as typeof chrome.tabs.sendMessage;

  return {
    dispatch,
    disconnect: () => {
      chromeMock.runtime.sendMessage = originalSendMessage;
      chromeMock.tabs.sendMessage = originalTabsSendMessage;
    },
  };
}
