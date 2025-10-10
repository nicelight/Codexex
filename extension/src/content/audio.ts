import { resolveChrome, type ChromeLogger, createChildLogger } from '../shared/chrome';

const AUDIO_RESOURCE = 'media/oh-oh-icq-sound.mp3';
const DEFAULT_GAIN = 0.2;
const ATTACK_TIME = 0.02;
const RELEASE_TIME = 0.35;
const FALLBACK_FREQUENCY = 880;

export interface ContentAudioControllerOptions {
  readonly window: Window;
  readonly logger: ChromeLogger;
}

export class ContentAudioController {
  private readonly window: Window;
  private readonly logger: ChromeLogger;
  private readonly chrome = resolveChrome();
  private audioContext?: AudioContext;
  private gainNode?: GainNode;
  private audioBuffer?: AudioBuffer;
  private pending = false;
  private unlocked = false;
  private initialized = false;

  constructor(options: ContentAudioControllerOptions) {
    this.window = options.window;
    this.logger = createChildLogger(options.logger, 'audio');
    this.window.addEventListener('pointerdown', () => {
      void this.unlock();
    }, { once: true, capture: true });
    this.window.addEventListener('keydown', () => {
      void this.unlock();
    }, { once: true, capture: true });
  }

  public async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    await this.unlock();
  }

  private async unlock(): Promise<void> {
    if (typeof this.window.AudioContext === 'undefined' || this.unlocked) {
      return;
    }
    try {
      this.audioContext = new this.window.AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      this.gainNode.connect(this.audioContext.destination);
      this.unlocked = true;
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      if (this.pending) {
        this.pending = false;
        await this.ensureAudioBuffer();
        await this.playChime();
      }
    } catch (error) {
      this.logger.warn('audio unlock failed', error);
    }
  }

  public async handleChimeRequest(): Promise<void> {
    if (!this.unlocked) {
      this.pending = true;
      return;
    }
    await this.ensureAudioBuffer();
    await this.playChime();
  }

  private async ensureAudioBuffer(): Promise<void> {
    if (this.audioBuffer || !this.audioContext) {
      return;
    }
    const url = this.chrome.runtime.getURL(AUDIO_RESOURCE);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`fetch status ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      this.audioBuffer = await this.decodeAudioData(buffer);
    } catch (error) {
      this.logger.debug('audio buffer load failed', error);
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
    if (!this.audioContext || !this.gainNode) {
      this.pending = true;
      return;
    }
    if (this.audioBuffer) {
      this.playBuffer();
      return;
    }
    this.playOscillator();
  }

  private playBuffer(): void {
    if (!this.audioContext || !this.gainNode || !this.audioBuffer) {
      this.pending = true;
      return;
    }
    const context = this.audioContext;
    const source = context.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(this.gainNode);
    scheduleEnvelope(context, this.gainNode);
    source.start(context.currentTime);
    source.stop(context.currentTime + RELEASE_TIME + 0.1);
    source.addEventListener('ended', () => {
      source.disconnect();
    });
  }

  private playOscillator(): void {
    if (!this.audioContext || !this.gainNode) {
      this.pending = true;
      return;
    }
    const context = this.audioContext;
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = FALLBACK_FREQUENCY;
    oscillator.connect(this.gainNode);
    scheduleEnvelope(context, this.gainNode);
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + RELEASE_TIME + 0.1);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
    });
  }
}

function scheduleEnvelope(context: AudioContext, gain: GainNode): void {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(DEFAULT_GAIN, now + ATTACK_TIME);
  gain.gain.linearRampToValueAtTime(0, now + ATTACK_TIME + RELEASE_TIME);
}
