import { resolveChrome, type ChromeLike } from './chrome';

export interface NormalizedUserSettings {
  debounceMs: number;
  sound: boolean;
  soundVolume: number;
  autoDiscardableOff: boolean;
  showBadgeCount: boolean;
}

export const SETTINGS_DEFAULTS: NormalizedUserSettings = {
  debounceMs: 12_000,
  sound: true,
  soundVolume: 0.2,
  autoDiscardableOff: true,
  showBadgeCount: true,
};

export function normalizeSettings(
  candidate: Partial<NormalizedUserSettings> | null | undefined,
): NormalizedUserSettings {
  const normalized: NormalizedUserSettings = { ...SETTINGS_DEFAULTS };
  if (!candidate) {
    return normalized;
  }
  if (typeof candidate.debounceMs === 'number' && Number.isFinite(candidate.debounceMs)) {
    normalized.debounceMs = Math.min(Math.max(Math.trunc(candidate.debounceMs), 0), 60_000);
  }
  if (typeof candidate.sound === 'boolean') {
    normalized.sound = candidate.sound;
  }
  if (typeof candidate.soundVolume === 'number' && Number.isFinite(candidate.soundVolume)) {
    normalized.soundVolume = clamp01(candidate.soundVolume);
  }
  if (typeof candidate.autoDiscardableOff === 'boolean') {
    normalized.autoDiscardableOff = candidate.autoDiscardableOff;
  }
  if (typeof candidate.showBadgeCount === 'boolean') {
    normalized.showBadgeCount = candidate.showBadgeCount;
  }
  return normalized;
}

export async function loadUserSettings(chrome: ChromeLike = resolveChrome()): Promise<NormalizedUserSettings> {
  if (!chrome.storage?.sync?.get) {
    return { ...SETTINGS_DEFAULTS };
  }
  try {
    const raw = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
    return normalizeSettings(raw as Partial<NormalizedUserSettings>);
  } catch (error) {
    console.warn('settings load failed', error);
    return { ...SETTINGS_DEFAULTS };
  }
}

export async function saveUserSettings(
  patch: Partial<NormalizedUserSettings>,
  chrome: ChromeLike = resolveChrome(),
): Promise<void> {
  if (!chrome.storage?.sync?.set) {
    return;
  }
  try {
    await chrome.storage.sync.set(patch);
  } catch (error) {
    console.warn('settings save failed', error);
  }
}

function clamp01(value: number): number {
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
