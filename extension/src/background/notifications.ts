/**
 * Placeholder for the user-facing notification pipeline.
 *
 * Notification requirements (debounce, RU/EN strings, single-fire when count
 * transitions from >0 to 0) are specified in `spec/system-capabilities.md`,
 * `spec/nfr.md` and `spec/test-plan.md`. The module will be fully implemented
 * in later roadmap phases.
 */

export function initializeNotifications(): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[codex-tasks-watcher] notifications placeholder initialized');
  }
}
