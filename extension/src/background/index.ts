/**
 * Entry point for the background service worker. Real listeners will be implemented in later
 * roadmap phases. The current implementation keeps the bundle valid and establishes the module
 * boundaries referenced by the specification.
 */

import { initializeAggregator } from './aggregator';
import { initializeNotifications } from './notifications';
import { registerAlarms } from './alarms';

chrome.runtime.onInstalled.addListener(() => {
  initializeAggregator();
  initializeNotifications();
  registerAlarms();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[codex-tasks-watcher] background bootstrap placeholder');
  }
});
