/**
 * Entry point for the content script. The actual implementation will be added in later phases
 * according to the Spec-Driven Development roadmap. At this stage we only ensure the bundle
 * structure compiles successfully under Vite.
 */

export function bootstrapContentScript(): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[codex-tasks-watcher] content script bootstrap placeholder');
  }
}

bootstrapContentScript();
