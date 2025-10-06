/**
 * Placeholder for chrome.alarms coordination. The actual scheduling strategy is
 * defined in `spec/system-capabilities.md` and `spec/nfr.md` (heartbeat <= 15s,
 * alarm ping interval, recovery from service worker sleep).
 */

export function registerAlarms(): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[codex-tasks-watcher] alarms placeholder registered');
  }
}
