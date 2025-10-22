import { resolveChrome, type ChromeLogger, createChildLogger } from '../shared/chrome';

const AUDIO_RESOURCE = 'media/oh-oh-icq-sound.mp3';
const AUDIO_ELEMENT_ID = 'codex-tasks-audio';
const DEFAULT_VOLUME = 0.2;

export interface ContentAudioControllerOptions {
  readonly window: Window;
  readonly logger: ChromeLogger;
}

export class ContentAudioController {
  private readonly window: Window;
  private readonly logger: ChromeLogger;
  private readonly chrome = resolveChrome();
  private audioElement?: HTMLAudioElement;
  private pending = false;
  private pendingVolume: number | undefined;
  private unlocked = false;
  private enabled = true;
  private volume = DEFAULT_VOLUME;
  private unlockListenersAttached = false;
  private readonly unlockEventHandler: () => void;

  constructor(options: ContentAudioControllerOptions) {
    this.window = options.window;
    this.logger = createChildLogger(options.logger, 'audio');
    this.unlockEventHandler = () => {
      this.detachUnlockListeners();
      void this.unlock();
    };
    this.ensureAudioElement();
    this.attachUnlockListeners();
  }

  public applySettings(settings: { sound?: boolean; soundVolume?: number }): void {
    if (typeof settings.sound === 'boolean') {
      this.enabled = settings.sound;
    }
    if (typeof settings.soundVolume === 'number') {
      this.volume = clampVolume(settings.soundVolume);
    }
    this.updateElementVolume();
  }

  public async handleChimeRequest(volumeOverride?: number): Promise<void> {
    if (!this.enabled) {
      this.clearPending();
      this.updateElementVolume();
      return;
    }

    const override =
      typeof volumeOverride === 'number' && Number.isFinite(volumeOverride)
        ? clampVolume(volumeOverride)
        : undefined;

    const element = this.ensureAudioElement();
    if (!element) {
      this.setPending(override);
      return;
    }

    if (!this.unlocked) {
      this.setPending(override);
      return;
    }

    const played = await this.playChime(override);
    if (!played) {
      if (clampVolume(override ?? this.volume) > 0) {
        this.setPending(override);
      } else {
        this.clearPending();
      }
      return;
    }

    this.clearPending();
  }

  private ensureAudioElement(): HTMLAudioElement | undefined {
    if (this.audioElement && this.audioElement.isConnected) {
      return this.audioElement;
    }

    const doc = this.window.document;
    if (!doc) {
      return undefined;
    }

    const existing = doc.getElementById(AUDIO_ELEMENT_ID);
    if (existing) {
      const AudioCtor = this.window.HTMLAudioElement;
      if (AudioCtor && existing instanceof AudioCtor) {
        this.audioElement = existing as HTMLAudioElement;
        this.updateElementVolume();
        return this.audioElement;
      }
      if (existing.tagName?.toLowerCase() === 'audio') {
        this.audioElement = existing as HTMLAudioElement;
        this.updateElementVolume();
        return this.audioElement;
      }
    }

    if (!doc.body) {
      this.logger.debug('audio element creation deferred: body unavailable');
      return undefined;
    }

    const url = this.getAudioUrl();
    if (!url) {
      this.logger.debug('audio element creation skipped: runtime.getURL unavailable');
      return undefined;
    }

    const element = doc.createElement('audio');
    element.id = AUDIO_ELEMENT_ID;
    element.preload = 'auto';
    element.controls = false;
    element.loop = false;
    element.muted = !this.enabled;
    element.volume = clampVolume(this.volume);
    element.setAttribute('aria-hidden', 'true');
    element.dataset.codexAudio = 'chime';
    element.tabIndex = -1;
    element.style.position = 'fixed';
    element.style.width = '0';
    element.style.height = '0';
    element.style.opacity = '0';
    element.style.pointerEvents = 'none';
    element.style.zIndex = '-1';

    const source = doc.createElement('source');
    source.src = url;
    source.type = 'audio/mpeg';
    element.appendChild(source);

    doc.body.appendChild(element);

    this.audioElement = element;
    this.updateElementVolume();

    return element;
  }

  private getAudioUrl(): string | undefined {
    const runtime = this.chrome.runtime;
    if (!runtime?.getURL) {
      return undefined;
    }
    try {
      return runtime.getURL(AUDIO_RESOURCE);
    } catch (error) {
      this.logger.debug('audio url resolution failed', error);
      return undefined;
    }
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

  private setPending(volume?: number): void {
    this.pending = true;
    this.pendingVolume = typeof volume === 'number' ? clampVolume(volume) : undefined;
    this.attachUnlockListeners();
  }

  private clearPending(): void {
    this.pending = false;
    this.pendingVolume = undefined;
  }

  private async unlock(): Promise<void> {
    const element = this.ensureAudioElement();
    if (!element) {
      this.attachUnlockListeners();
      return;
    }

    const previousVolume = element.volume;
    const previousMuted = element.muted;

    try {
      element.muted = true;
      element.volume = 0;
      const playResult = element.play();
      if (playResult && typeof playResult.then === 'function') {
        await playResult;
      }
      element.pause();
      element.currentTime = 0;
      this.unlocked = true;
      this.detachUnlockListeners();
    } catch (error) {
      this.logger.debug('audio unlock failed', error);
      this.unlocked = false;
      this.attachUnlockListeners();
      return;
    } finally {
      element.volume = previousVolume;
      element.muted = previousMuted;
      this.updateElementVolume();
    }

    if (this.pending) {
      const played = await this.playChime(this.pendingVolume);
      if (played) {
        this.clearPending();
      } else {
        this.setPending(this.pendingVolume);
      }
    }
  }

  private async playChime(volumeOverride?: number): Promise<boolean> {
    const element = this.ensureAudioElement();
    if (!element) {
      return false;
    }

    if (!this.enabled) {
      return false;
    }

    const volume = clampVolume(
      typeof volumeOverride === 'number' ? volumeOverride : this.volume,
    );

    if (volume <= 0) {
      return false;
    }

    try {
      element.pause();
      element.currentTime = 0;
      element.volume = volume;
      element.muted = false;
      const playResult = element.play();
      if (playResult && typeof playResult.then === 'function') {
        await playResult;
      }
      return true;
    } catch (error) {
      this.logger.debug('audio playback failed', error);
      return false;
    } finally {
      this.updateElementVolume();
    }
  }

  private updateElementVolume(): void {
    if (!this.audioElement) {
      return;
    }
    const targetVolume = clampVolume(this.volume);
    this.audioElement.volume = targetVolume;
    this.audioElement.muted = !this.enabled || targetVolume <= 0;
  }
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
