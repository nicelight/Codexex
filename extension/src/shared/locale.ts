import { resolveChrome, type ChromeLike } from './chrome';

export function resolveLocale(input?: ChromeLike): 'en' | 'ru' {
  const chrome = input ?? resolveChrome();
  const uiLocale = chrome.i18n?.getUILanguage?.() ?? globalThis.navigator?.language ?? 'en';
  return uiLocale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
