import { resolveChrome, type ChromeLogger, createChildLogger } from '../shared/chrome';

const AUDIO_RESOURCE = 'media/oh-oh-icq-sound.mp3';
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
    if (this.unlocked) {
      const element = this.ensureAudioElement();
      if (!element) {
        this.setPending(this.pendingVolume);
        return;
      }
      if (this.pending) {
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
      const element = this.ensureAudioElement();
      if (!element) {
        this.attachUnlockListeners();
        this.setPending(this.pendingVolume);
        return;
      }
      const originalVolume = element.volume;
      element.volume = 0;
      const played = await this.playElement(element);
      if (!played) {
        element.volume = originalVolume;
        this.attachUnlockListeners();
        this.setPending(this.pendingVolume);
        return;
      }
      element.pause();
      element.currentTime = 0;
      element.volume = clampVolume(this.volume);
      this.unlocked = true;
      this.unlockListenersAttached = false;
      if (this.pending) {
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
      if (this.audioElement) {
        this.audioElement.volume = this.volume;
      }
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

  private async playChime(volumeOverride?: number): Promise<boolean> {
    const element = this.ensureAudioElement();
    if (!element) {
      return false;
    }
    const gain = clampVolume(
      typeof volumeOverride === 'number' && Number.isFinite(volumeOverride) ? volumeOverride : this.volume,
    );
    if (gain <= 0) {
      return false;
    }
    element.volume = gain;
    element.currentTime = 0;
    const played = await this.playElement(element);
    if (!played) {
      return false;
    }
    return true;
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

  private ensureAudioElement(): HTMLAudioElement | undefined {
    if (this.audioElement) {
      return this.audioElement;
    }

    const document = this.window.document;
    if (!document) {
      return undefined;
    }

    const getUrl = this.chrome.runtime.getURL?.bind(this.chrome.runtime);
    if (!getUrl) {
      this.logger.debug('audio element creation skipped: runtime.getURL unavailable');
      return undefined;
    }

    const element = document.createElement('audio');
    element.preload = 'auto';
    element.setAttribute('aria-hidden', 'true');
    element.tabIndex = -1;
    element.src = getUrl(AUDIO_RESOURCE);
    element.volume = clampVolume(this.volume);
    element.style.display = 'none';
    element.addEventListener('ended', () => {
      element.currentTime = 0;
    });

    const parent = document.body ?? document.documentElement;
    parent?.appendChild(element);

    try {
      element.load();
    } catch (error) {
      this.logger.debug('audio element preload failed', error);
    }

    this.audioElement = element;
    return element;
  }

  private async playElement(element: HTMLAudioElement): Promise<boolean> {
    try {
      const result = element.play();
      if (result && typeof result.then === 'function') {
        await result;
      }
      return true;
    } catch (error) {
      this.logger.debug('audio playback failed', error);
      this.attachUnlockListeners();
      return false;
    }
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
