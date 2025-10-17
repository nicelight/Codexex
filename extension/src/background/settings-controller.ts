import {
  createChildLogger,
  createLogger,
  resolveChrome,
  type ChromeLike,
  type ChromeLogger,
} from '../shared/chrome';
import {
  loadUserSettings,
  normalizeSettings,
  SETTINGS_DEFAULTS,
  type NormalizedUserSettings,
} from '../shared/settings';

export interface SettingsControllerOptions {
  readonly chrome?: ChromeLike;
  readonly logger?: ChromeLogger;
}

export interface BackgroundSettingsController {
  readonly ready: Promise<void>;
  getSnapshot(): NormalizedUserSettings;
  onChange(listener: (settings: NormalizedUserSettings) => void): () => void;
}

export function initializeSettingsController(
  options: SettingsControllerOptions = {},
): BackgroundSettingsController {
  return new BackgroundSettingsControllerImpl(options);
}

class BackgroundSettingsControllerImpl implements BackgroundSettingsController {
  public readonly ready: Promise<void>;

  private settings: NormalizedUserSettings = { ...SETTINGS_DEFAULTS };
  private readonly chrome: ChromeLike;
  private readonly logger: ChromeLogger;
  private readonly listeners = new Set<(settings: NormalizedUserSettings) => void>();

  constructor(options: SettingsControllerOptions) {
    this.chrome = options.chrome ?? resolveChrome();
    const baseLogger = options.logger ?? createLogger('codex-background');
    this.logger = createChildLogger(baseLogger, 'settings');
    this.ready = this.refreshSettings();
    this.chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }
      const patch: Partial<NormalizedUserSettings> = {};
      const debounceChange = changes.debounceMs;
      if (debounceChange && typeof debounceChange.newValue === 'number') {
        patch.debounceMs = debounceChange.newValue;
      }
      const soundChange = changes.sound;
      if (soundChange && typeof soundChange.newValue === 'boolean') {
        patch.sound = soundChange.newValue;
      }
      const soundVolumeChange = changes.soundVolume;
      if (soundVolumeChange && typeof soundVolumeChange.newValue === 'number') {
        patch.soundVolume = soundVolumeChange.newValue;
      }
      const autoDiscardableChange = changes.autoDiscardableOff;
      if (
        autoDiscardableChange &&
        typeof autoDiscardableChange.newValue === 'boolean'
      ) {
        patch.autoDiscardableOff = autoDiscardableChange.newValue;
      }
      const badgeChange = changes.showBadgeCount;
      if (badgeChange && typeof badgeChange.newValue === 'boolean') {
        patch.showBadgeCount = badgeChange.newValue;
      }
      if (Object.keys(patch).length === 0) {
        return;
      }
      this.applyPatch(patch);
    });
  }

  public getSnapshot(): NormalizedUserSettings {
    return { ...this.settings };
  }

  public onChange(
    listener: (settings: NormalizedUserSettings) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async refreshSettings(): Promise<void> {
    try {
      const snapshot = await loadUserSettings(this.chrome);
      this.applySettings(snapshot);
    } catch (error) {
      this.logger.warn('failed to load user settings', error);
      this.applySettings({ ...SETTINGS_DEFAULTS });
    }
  }

  private applyPatch(patch: Partial<NormalizedUserSettings>): void {
    const next = normalizeSettings({ ...this.settings, ...patch });
    if (areSettingsEqual(this.settings, next)) {
      return;
    }
    this.applySettings(next);
  }

  private applySettings(settings: NormalizedUserSettings): void {
    this.settings = { ...settings };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    for (const listener of Array.from(this.listeners)) {
      try {
        listener({ ...snapshot });
      } catch (error) {
        this.logger.error('settings listener threw', error);
      }
    }
  }
}

function areSettingsEqual(
  previous: NormalizedUserSettings,
  next: NormalizedUserSettings,
): boolean {
  return (
    previous.debounceMs === next.debounceMs &&
    previous.sound === next.sound &&
    previous.soundVolume === next.soundVolume &&
    previous.autoDiscardableOff === next.autoDiscardableOff &&
    previous.showBadgeCount === next.showBadgeCount
  );
}
