import type { AggregatorChangeEvent, BackgroundAggregator } from './aggregator';
import { resolveChrome, type ChromeLike, type ChromeLogger, createChildLogger, createLogger } from '../shared/chrome';

const AUDIO_RESOURCE = 'media/oh-oh-icq-sound.mp3';
const DEFAULT_PEAK_GAIN = 0.18;
const ATTACK_TIME = 0.02;
const RELEASE_TIME = 0.4;
const FALLBACK_FREQUENCY = 880;

export interface AudioNotifierOptions {
  readonly chrome?: ChromeLike;
  readonly logger?: ChromeLogger;
}

export interface AudioNotifierController {
  activate(): Promise<void>;
  dispose(): void;
}

export function initializeAudioNotifier(
  aggregator: BackgroundAggregator,
  options: AudioNotifierOptions = {},
): AudioNotifierController {
  const chrome = options.chrome ?? resolveChrome();
  const logger = createChildLogger(options.logger ?? createLogger('codex-background'), 'audio');
  const controller = new AudioNotifierImpl(aggregator, { chrome, logger });
  return {
    activate: () => controller.activate(),
    dispose: () => controller.dispose(),
  };
}

class AudioNotifierImpl {
  private audioContext?: AudioContext;
  private pendingPlay = false;
  private audioBuffer?: AudioBuffer;
  private lastTotal = 0;
  private readonly chrome: ChromeLike;
  private readonly logger: ChromeLogger;
  private readonly unsubscribe: () => void;

  constructor(aggregator: BackgroundAggregator, deps: { chrome: ChromeLike; logger: ChromeLogger }) {
    this.chrome = deps.chrome;
    this.logger = deps.logger;
    this.unsubscribe = aggregator.onStateChange((event) => {
      void this.handleStateChange(event);
    });
    void aggregator.ready.then(() => {
      void aggregator.getSnapshot().then((snapshot) => {
        this.lastTotal = snapshot.lastTotal ?? 0;
      });
    });
  }

  public dispose(): void {
    this.unsubscribe();
    this.pendingPlay = false;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close().catch((error) => {
        this.logger.warn('audio context close failed', error);
      });
    }
    this.audioContext = undefined;
    this.audioBuffer = undefined;
  }

  public async activate(): Promise<void> {
    if (!this.audioContext) {
      try {
        this.audioContext = new AudioContext();
      } catch (error) {
        this.logger.warn('failed to create AudioContext', error);
        return;
      }
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        this.logger.warn('AudioContext resume failed', error);
      }
    }
    await this.ensureAudioBuffer();
    if (this.pendingPlay) {
      this.pendingPlay = false;
      await this.playChime();
    }
  }

  private async handleStateChange(event: AggregatorChangeEvent): Promise<void> {
    const previousTotal = event.previous.lastTotal ?? 0;
    const nextTotal = event.current.lastTotal ?? 0;
    this.lastTotal = nextTotal;
    if (previousTotal > 0 && nextTotal === 0) {
      await this.triggerChime();
    }
  }

  private async triggerChime(): Promise<void> {
    if (!this.audioContext) {
      this.pendingPlay = true;
      return;
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        this.logger.warn('AudioContext resume failed before chime', error);
        this.pendingPlay = true;
        return;
      }
    }
    await this.ensureAudioBuffer();
    await this.playChime();
  }

  private async ensureAudioBuffer(): Promise<void> {
    if (!this.audioContext || this.audioBuffer) {
      return;
    }
    const url = this.chrome.runtime.getURL(AUDIO_RESOURCE);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio asset: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.decodeAudioData(arrayBuffer);
    } catch (error) {
      this.logger.warn('audio asset load failed, using oscillator fallback', error);
    }
  }

  private async decodeAudioData(buffer: ArrayBuffer): Promise<AudioBuffer | undefined> {
    if (!this.audioContext) {
      return undefined;
    }
    if (typeof this.audioContext.decodeAudioData === 'function') {
      return this.audioContext.decodeAudioData(buffer);
    }
    return undefined;
  }

  private async playChime(): Promise<void> {
    if (!this.audioContext) {
      this.pendingPlay = true;
      return;
    }
    if (this.audioBuffer) {
      this.playFromBuffer();
      return;
    }
    this.playOscillatorFallback();
  }

  private playFromBuffer(): void {
    if (!this.audioContext || !this.audioBuffer) {
      return;
    }
    const ctx = this.audioContext;
    const source = ctx.createBufferSource();
    source.buffer = this.audioBuffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.connect(ctx.destination);
    source.connect(gain);
    scheduleEnvelope(ctx, gain);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + RELEASE_TIME + 0.1);
    source.addEventListener('ended', () => {
      source.disconnect();
      gain.disconnect();
    });
  }

  private playOscillatorFallback(): void {
    if (!this.audioContext) {
      return;
    }
    const ctx = this.audioContext;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = FALLBACK_FREQUENCY;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    scheduleEnvelope(ctx, gain);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + RELEASE_TIME + 0.1);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    });
  }
}

function scheduleEnvelope(context: AudioContext, gain: GainNode): void {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(DEFAULT_PEAK_GAIN, now + ATTACK_TIME);
  gain.gain.linearRampToValueAtTime(0, now + ATTACK_TIME + RELEASE_TIME);
}
