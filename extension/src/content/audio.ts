import { resolveChrome, type ChromeLogger, createChildLogger } from '../shared/chrome';

type AudioContextConstructor = typeof globalThis.AudioContext;

interface AudioCapableWindow extends Window {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
}

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
  private readonly window: AudioCapableWindow;
  private readonly logger: ChromeLogger;
  private readonly chrome = resolveChrome();
  private audioContext?: AudioContext;
  private gainNode?: GainNode;
  private audioBuffer?: AudioBuffer;
  private pending = false;
  private pendingVolume: number | undefined;
  private unlocked = false;
  private initialized = false;
  private unlockListenersAttached = false;
  private readonly unlockEventHandler: () => void;
  private volume = DEFAULT_VOLUME;
  private enabled = true;

  constructor(options: ContentAudioControllerOptions) {
    this.window = options.window as AudioCapableWindow;
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
    const AudioContextCtor = this.window.AudioContext ?? this.window.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    if (this.unlocked) {
      const resumed = await this.resumeContextIfNeeded();
      if (!resumed) {
        this.setPending(this.pendingVolume);
        return;
      }
      if (this.pending) {
        await this.ensureAudioBuffer();
        const played = await this.playChime(this.pendingVolume);
        if (played) {
          this.clearPending();
        } else {
          this.setPending(this.pendingVolume);
        }
      }
      return;
    }
    try {
      this.audioContext = new AudioContextCtor();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      this.gainNode.connect(this.audioContext.destination);
      this.unlocked = true;
      this.unlockListenersAttached = false;
      const resumed = await this.resumeContextIfNeeded();
      if (!resumed) {
        this.setPending(this.pendingVolume);
        return;
      }
      if (this.pending) {
        await this.ensureAudioBuffer();
        const played = await this.playChime(this.pendingVolume);
        if (played) {
          this.clearPending();
        } else {
          this.setPending(this.pendingVolume);
        }
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
      this.clearPending();
      return;
    }
    const requestedVolume =
      typeof volumeOverride === 'number' && Number.isFinite(volumeOverride) ? volumeOverride : undefined;
    if (!this.unlocked) {
      this.setPending(requestedVolume);
      return;
    }
    const resumed = await this.resumeContextIfNeeded();
    if (!resumed) {
      this.setPending(requestedVolume);
      return;
    }
    await this.ensureAudioBuffer();
    const played = await this.playChime(requestedVolume);
    if (!played) {
      if (clampVolume(requestedVolume ?? this.volume) > 0) {
        this.setPending(requestedVolume);
      } else {
        this.clearPending();
      }
      return;
    }
    this.clearPending();
  }

  private attachUnlockListeners(): void {
    if (this.unlockListenersAttached) {
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

  private async resumeContextIfNeeded(): Promise<boolean> {
    if (!this.audioContext) {
      return false;
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        return true;
      } catch (error) {
        this.logger.debug('audio resume failed', error);
        return false;
      }
    }
    return true;
  }

  private async ensureAudioBuffer(): Promise<void> {
    if (this.audioBuffer || !this.audioContext) {
      return;
    }
    const getUrl = this.chrome.runtime.getURL?.bind(this.chrome.runtime);
    if (!getUrl) {
      this.logger.debug('audio buffer load skipped: runtime.getURL unavailable');
      return;
    }
    const url = getUrl(AUDIO_RESOURCE);
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

  private async playChime(volumeOverride?: number): Promise<boolean> {
    if (!this.audioContext || !this.gainNode) {
      return false;
    }
    const gain = clampVolume(
      typeof volumeOverride === 'number' && Number.isFinite(volumeOverride) ? volumeOverride : this.volume,
    );
    if (gain <= 0) {
      return false;
    }
    if (this.audioBuffer) {
      this.playBuffer(gain);
      return true;
    }
    this.playOscillator(gain);
    return true;
  }

  private playBuffer(gain: number): void {
    if (!this.audioContext || !this.gainNode || !this.audioBuffer) {
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

  private setPending(volume?: number): void {
    this.pending = true;
    this.pendingVolume =
      typeof volume === 'number' && Number.isFinite(volume) ? clampVolume(volume) : undefined;
    this.attachUnlockListeners();
  }

  private clearPending(): void {
    this.pending = false;
    this.pendingVolume = undefined;
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
