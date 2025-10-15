import type { AggregatorChangeEvent, BackgroundAggregator } from './aggregator';
import type { AggregatedTabsState } from '../shared/contracts';
import {
  createChildLogger,
  createLogger,
  resolveChrome,
  type ChromeLike,
  type ChromeLogger,
  type StorageChangeListener,
} from '../shared/chrome';
import { loadUserSettings, SETTINGS_DEFAULTS, type NormalizedUserSettings } from '../shared/settings';

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

type AudioEventPayload =
  | { type: 'AUDIO_CHIME'; volume: number }
  | { type: 'AUDIO_SETTINGS_UPDATE'; sound: boolean; soundVolume: number };

class AudioTrigger {
  private disposed = false;
  private readonly unsubscribe: () => void;
  private readonly storageListener: StorageChangeListener;
  private soundEnabled = SETTINGS_DEFAULTS.sound;
  private soundVolume = SETTINGS_DEFAULTS.soundVolume;
  private settingsInitialized = false;
  private waitingForIdle = false;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private debounceTarget = 0;

  constructor(
    private readonly aggregator: BackgroundAggregator,
    private readonly chrome: ChromeLike,
    private readonly logger: ChromeLogger,
  ) {
    this.unsubscribe = aggregator.onStateChange((event) => {
      void this.handleStateChange(event);
    });
    this.storageListener = (changes, areaName) => {
      if (this.disposed || areaName !== 'sync') {
        return;
      }
      const patch: Partial<Pick<NormalizedUserSettings, 'sound' | 'soundVolume'>> = {};
      const soundChange = changes.sound;
      if (soundChange && typeof soundChange.newValue === 'boolean') {
        patch.sound = soundChange.newValue;
      }
      const volumeChange = changes.soundVolume;
      if (volumeChange && typeof volumeChange.newValue === 'number') {
        patch.soundVolume = volumeChange.newValue;
      }
      if (Object.keys(patch).length > 0) {
        this.applySettings(patch);
      }
    };
    this.chrome.storage.onChanged.addListener(this.storageListener);
    void aggregator.ready.catch((error) => {
      this.logger.warn('failed to init audio trigger state', error);
    });
    void this.refreshSettings();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribe();
    this.chrome.storage.onChanged.removeListener(this.storageListener);
    this.clearDebounceTimer();
  }

  private async refreshSettings(): Promise<void> {
    try {
      const settings = await loadUserSettings(this.chrome);
      this.applySettings({
        sound: settings.sound,
        soundVolume: settings.soundVolume,
      });
    } catch (error) {
      this.logger.debug('failed to load audio settings', error);
    }
  }

  private applySettings(patch: Partial<Pick<NormalizedUserSettings, 'sound' | 'soundVolume'>>): void {
    let changed = !this.settingsInitialized;
    if (typeof patch.sound === 'boolean' && patch.sound !== this.soundEnabled) {
      this.soundEnabled = patch.sound;
      changed = true;
    }
    if (typeof patch.soundVolume === 'number') {
      const nextVolume = clampVolume(patch.soundVolume);
      if (nextVolume !== this.soundVolume) {
        this.soundVolume = nextVolume;
        changed = true;
      }
    }
    this.settingsInitialized = true;
    if (changed) {
      void this.broadcastSettingsUpdate();
    }
  }

  private async handleStateChange(event: AggregatorChangeEvent): Promise<void> {
    if (this.disposed) {
      return;
    }
    const previousTotal = event.previous.lastTotal ?? 0;
    const nextTotal = event.current.lastTotal ?? 0;
    if (nextTotal > 0) {
      this.waitingForIdle = false;
      this.clearDebounceTimer();
      return;
    }
    if (previousTotal > 0 && nextTotal === 0) {
      this.waitingForIdle = true;
      await this.tryTriggerChime(event.current);
      return;
    }
    if (this.waitingForIdle && nextTotal === 0) {
      await this.tryTriggerChime(event.current);
    }
  }

  private async broadcastSettingsUpdate(): Promise<void> {
    const event: AudioEventPayload = {
      type: 'AUDIO_SETTINGS_UPDATE',
      sound: this.soundEnabled,
      soundVolume: this.soundVolume,
    };
    await this.sendRuntimeMessage(event);
    await this.sendTabMessages(event);
  }

  private async broadcastAudioChime(): Promise<void> {
    if (!this.soundEnabled) {
      return;
    }
    const volume = clampVolume(this.soundVolume);
    if (volume <= 0) {
      return;
    }
    const event: AudioEventPayload = { type: 'AUDIO_CHIME', volume };
    await this.sendRuntimeMessage(event);
    await this.sendTabMessages(event);
  }

  private async tryTriggerChime(state?: AggregatedTabsState): Promise<void> {
    if (this.disposed || !this.waitingForIdle) {
      return;
    }
    const snapshot = state ?? (await this.aggregator.getSnapshot());
    if (snapshot.lastTotal !== 0 || !allCountsZero(snapshot)) {
      this.waitingForIdle = false;
      this.clearDebounceTimer();
      return;
    }
    if (snapshot.debounce.since === 0) {
      this.waitingForIdle = false;
      this.clearDebounceTimer();
      await this.broadcastAudioChime();
      return;
    }
    const target = snapshot.debounce.since + snapshot.debounce.ms;
    const now = Date.now();
    if (now >= target) {
      this.waitingForIdle = false;
      this.clearDebounceTimer();
      await this.broadcastAudioChime();
      return;
    }
    this.scheduleDebounceTimer(target, now);
  }

  private scheduleDebounceTimer(target: number, now: number): void {
    if (this.debounceTimer && this.debounceTarget === target) {
      return;
    }
    this.clearDebounceTimer();
    const delay = Math.max(0, target - now);
    this.debounceTarget = target;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.debounceTarget = 0;
      void this.tryTriggerChime();
    }, delay);
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.debounceTarget = 0;
  }

  private async sendRuntimeMessage(event: AudioEventPayload): Promise<void> {
    try {
      await this.chrome.runtime.sendMessage(event);
    } catch (error) {
      this.logger.debug('runtime audio message failed', error);
    }
  }

  private async sendTabMessages(event: AudioEventPayload): Promise<void> {
    try {
      const tabIds = await this.aggregator.getTrackedTabIds();
      await Promise.all(
        tabIds.map(async (tabId) => {
          try {
            await this.chrome.tabs.sendMessage(tabId, event);
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

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return SETTINGS_DEFAULTS.soundVolume;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function allCountsZero(state: AggregatedTabsState): boolean {
  return Object.values(state.tabs).every((tab) => tab.count === 0);
}
