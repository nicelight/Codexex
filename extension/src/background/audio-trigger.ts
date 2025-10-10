import type { AggregatorChangeEvent, BackgroundAggregator } from './aggregator';
import {
  createChildLogger,
  createLogger,
  resolveChrome,
  type ChromeLike,
  type ChromeLogger,
} from '../shared/chrome';

const AUDIO_EVENT = { type: 'AUDIO_CHIME' as const };

export interface AudioTriggerOptions {
  readonly chrome?: ChromeLike;
  readonly logger?: ChromeLogger;
}

export interface AudioTriggerController {
  dispose(): void;
}

export function initializeAudioTrigger(
  aggregator: BackgroundAggregator,
  options: AudioTriggerOptions = {},
): AudioTriggerController {
  const chrome = options.chrome ?? resolveChrome();
  const logger = createChildLogger(options.logger ?? createLogger('codex-background'), 'audio-trigger');

  const controller = new AudioTrigger(aggregator, chrome, logger);
  return {
    dispose() {
      controller.dispose();
    },
  };
}

class AudioTrigger {
  private lastTotal = 0;
  private disposed = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly aggregator: BackgroundAggregator,
    private readonly chrome: ChromeLike,
    private readonly logger: ChromeLogger,
  ) {
    this.unsubscribe = aggregator.onStateChange((event) => {
      void this.handleStateChange(event);
    });
    void aggregator.ready
      .then(() => aggregator.getSnapshot())
      .then((snapshot) => {
        this.lastTotal = snapshot.lastTotal ?? 0;
      })
      .catch((error) => {
        this.logger.warn('failed to init audio trigger state', error);
      });
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribe();
  }

  private async handleStateChange(event: AggregatorChangeEvent): Promise<void> {
    if (this.disposed) {
      return;
    }
    const previousTotal = event.previous.lastTotal ?? 0;
    const nextTotal = event.current.lastTotal ?? 0;
    this.lastTotal = nextTotal;
    if (previousTotal > 0 && nextTotal === 0) {
      await this.broadcastAudioChime();
    }
  }

  private async broadcastAudioChime(): Promise<void> {
    await this.sendRuntimeMessage();
    await this.sendTabMessages();
  }

  private async sendRuntimeMessage(): Promise<void> {
    try {
      await this.chrome.runtime.sendMessage(AUDIO_EVENT);
    } catch (error) {
      this.logger.debug('runtime audio message failed', error);
    }
  }

  private async sendTabMessages(): Promise<void> {
    try {
      const tabIds = await this.aggregator.getTrackedTabIds();
      await Promise.all(
        tabIds.map(async (tabId) => {
          try {
            await this.chrome.tabs.sendMessage(tabId, AUDIO_EVENT);
          } catch (error) {
            this.logger.debug('audio tab message failed', { tabId, error });
          }
        }),
      );
    } catch (error) {
      this.logger.debug('audio tab broadcast failed', error);
    }
  }
}
