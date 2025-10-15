import { resolveChrome, type ChromeLogger, createChildLogger } from '../shared/chrome';

const AUDIO_RESOURCE = 'media/oh-oh-icq-sound.mp3';
const DEFAULT_VOLUME = 0.2;
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
  private unlockListenersAttached = false;
  private readonly unlockEventHandler: () => void;
  private volume = DEFAULT_VOLUME;
  private enabled = true;

  constructor(options: ContentAudioControllerOptions) {
    this.window = options.window;
    this.logger = createChildLogger(options.logger, 'audio');
    this.unlockEventHandler = () => {
      this.detachUnlockListeners();
      void this.unlock();
    };
    this.attachUnlockListeners();
  }

  public async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.attachUnlockListeners();
  }

  private async unlock(): Promise<void> {
    this.detachUnlockListeners();
    if (typeof this.window.AudioContext === 'undefined') {
      return;
    }
    if (this.unlocked) {
      await this.resumeContextIfNeeded();
      return;
    }
    try {
      this.audioContext = new this.window.AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      this.gainNode.connect(this.audioContext.destination);
      this.unlocked = true;
      this.unlockListenersAttached = false;
      await this.resumeContextIfNeeded();
      if (this.pending) {
        this.pending = false;
        await this.ensureAudioBuffer();
        await this.playChime();
      }
    } catch (error) {
      this.logger.warn('audio unlock failed', error);
      this.attachUnlockListeners();
    }
  }

  public applySettings(settings: { sound?: boolean; soundVolume?: number }): void {
    if (typeof settings.sound === 'boolean') {
      this.enabled = settings.sound;
    }
    if (typeof settings.soundVolume === 'number') {
      this.volume = clampVolume(settings.soundVolume);
    }
  }

  public async handleChimeRequest(volumeOverride?: number): Promise<void> {
    if (!this.enabled) {
      this.pending = false;
      return;
    }
    if (!this.unlocked) {
      this.pending = true;
      this.attachUnlockListeners();
      return;
    }
    await this.resumeContextIfNeeded();
    await this.ensureAudioBuffer();
    await this.playChime(volumeOverride);
  }

  private attachUnlockListeners(): void {
    if (this.unlocked || this.unlockListenersAttached) {
      return;
    }
    this.unlockListenersAttached = true;
    this.window.addEventListener('pointerdown', this.unlockEventHandler, { capture: true });
    this.window.addEventListener('keydown', this.unlockEventHandler, { capture: true });
  }

  private detachUnlockListeners(): void {
    if (!this.unlockListenersAttached) {
      return;
    }
    this.window.removeEventListener('pointerdown', this.unlockEventHandler, true);
    this.window.removeEventListener('keydown', this.unlockEventHandler, true);
    this.unlockListenersAttached = false;
  }

  private async resumeContextIfNeeded(): Promise<void> {
    if (!this.audioContext) {
      return;
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        this.logger.debug('audio resume failed', error);
      }
    }
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

  private async playChime(volumeOverride?: number): Promise<void> {
    if (!this.audioContext || !this.gainNode) {
      this.pending = true;
      return;
    }
    const gain = clampVolume(typeof volumeOverride === 'number' ? volumeOverride : this.volume);
    if (gain <= 0) {
      return;
    }
    if (this.audioBuffer) {
      this.playBuffer(gain);
      return;
    }
    this.playOscillator(gain);
  }

  private playBuffer(gain: number): void {
    if (!this.audioContext || !this.gainNode || !this.audioBuffer) {
      this.pending = true;
      return;
    }
    const context = this.audioContext;
    const source = context.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(this.gainNode);
    scheduleEnvelope(context, this.gainNode, gain);
    source.start(context.currentTime);
    source.stop(context.currentTime + RELEASE_TIME + 0.1);
    source.addEventListener('ended', () => {
      source.disconnect();
    });
  }

  private playOscillator(gain: number): void {
    if (!this.audioContext || !this.gainNode) {
      this.pending = true;
      return;
    }
    const context = this.audioContext;
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = FALLBACK_FREQUENCY;
    oscillator.connect(this.gainNode);
    scheduleEnvelope(context, this.gainNode, gain);
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + RELEASE_TIME + 0.1);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
    });
  }
}

function scheduleEnvelope(context: AudioContext, gain: GainNode, volume: number): void {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  const target = clampVolume(volume);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(target, now + ATTACK_TIME);
  gain.gain.linearRampToValueAtTime(0, now + ATTACK_TIME + RELEASE_TIME);
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VOLUME;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
