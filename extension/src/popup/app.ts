/**
 * Placeholder bootstrap for the popup UI. The actual rendering logic will be introduced during
 * the popup implementation phase. Keeping this file minimal ensures the build can locate the
 * popup entry module referenced by the manifest and Vite configuration.
 */

export function mountPopup(root: HTMLElement): void {
  root.textContent = 'Codex Tasks Watcher — popup placeholder';
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('app');
  if (root) {
    mountPopup(root);
  }
}
