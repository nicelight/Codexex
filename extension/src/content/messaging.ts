import type {
  ContentScriptHeartbeat,
  ContentScriptTasksUpdate,
} from '../shared/contracts';
import {
  createChildLogger,
  resolveChrome,
  type ChromeLogger,
  type RuntimeMessageListener,
} from '../shared/chrome';

export type OutgoingContentMessage =
  | ContentScriptTasksUpdate
  | ContentScriptHeartbeat;

export type BackgroundEvent =
  | { type: 'PING' }
  | { type: 'RESET' }
  | { type: 'REQUEST_STATE' }
  | { type: 'AUDIO_CHIME'; volume?: number }
  | { type: 'AUDIO_PREVIEW'; volume?: number }
  | { type: 'AUDIO_SETTINGS_UPDATE'; sound?: boolean; soundVolume?: number };

export type BackgroundEventHandler = (
  event: BackgroundEvent,
  sender: chrome.runtime.MessageSender,
) => void | Promise<void>;

function toPromise<T>(executor: (resolve: (value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve) => executor(resolve));
}

export async function postToBackground(
  message: OutgoingContentMessage,
  logger: ChromeLogger,
): Promise<void> {
  const chrome = resolveChrome();
  if (!chrome.runtime?.id) {
    logger.warn('runtime unavailable, skipping message (runtime-id-missing)');
    return;
  }
  logger.debug('post message', message);
  await toPromise<void>((resolve) => {
    try {
      chrome.runtime.sendMessage(message, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          logger.warn('sendMessage error', lastError.message);
        }
        resolve();
      });
    } catch (error) {
      logger.error('sendMessage threw', error);
      resolve();
    }
  });
}

function parseBackgroundEvent(message: unknown): BackgroundEvent | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  const { type } = message as { type?: unknown };
  if (type === 'PING' || type === 'RESET' || type === 'REQUEST_STATE') {
    return { type } as BackgroundEvent;
  }
  if (type === 'AUDIO_CHIME') {
    const { volume } = message as { volume?: unknown };
    return { type: 'AUDIO_CHIME', volume: typeof volume === 'number' ? volume : undefined };
  }
  if (type === 'AUDIO_PREVIEW') {
    const { volume } = message as { volume?: unknown };
    return { type: 'AUDIO_PREVIEW', volume: typeof volume === 'number' ? volume : undefined };
  }
  if (type === 'AUDIO_SETTINGS_UPDATE') {
    const { sound, soundVolume } = message as { sound?: unknown; soundVolume?: unknown };
    return {
      type: 'AUDIO_SETTINGS_UPDATE',
      ...(typeof sound === 'boolean' ? { sound } : {}),
      ...(typeof soundVolume === 'number' ? { soundVolume } : {}),
    };
  }
  return undefined;
}

export function onBackgroundEvent(
  handler: BackgroundEventHandler,
  parentLogger: ChromeLogger,
): () => void {
  const chrome = resolveChrome();
  const logger = createChildLogger(parentLogger, 'background-listener');
  const listener: RuntimeMessageListener = (message, sender) => {
    const event = parseBackgroundEvent(message);
    if (!event) {
      return;
    }
    logger.debug('received event', event);
    try {
      const result = handler(event, sender);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).catch((error) => {
          logger.error('handler rejected', error);
        });
      }
    } catch (error) {
      logger.error('handler threw', error);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}
