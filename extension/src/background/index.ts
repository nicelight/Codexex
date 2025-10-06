/**
 * Entry point for the background service worker. Real listeners will be implemented in later
 * roadmap phases. The current implementation keeps the bundle valid and establishes the module
 * boundaries referenced by the specification.
 */

chrome.runtime.onInstalled.addListener(() => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[codex-tasks-watcher] background bootstrap placeholder');
  }
});
