/**
 * Aggregator module placeholder. The real implementation will manage TASKS_UPDATE and
 * TASKS_HEARTBEAT payloads according to the JSON Schemas defined in `contracts/state/*`
 * and the flows described in `spec/system-capabilities.md`.
 */

export function initializeAggregator(): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[codex-tasks-watcher] aggregator bootstrap placeholder');
  }
}
