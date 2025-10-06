/**
 * Messaging facade between the content script and the background service worker.
 *
 * The concrete implementation is defined by the DTOs in `contracts/dto/*` and the
 * interaction flows in `spec/use-cases.md` / `spec/system-capabilities.md`.
 *
 * Phase 0 of the roadmap only establishes the module boundary so imports used in
 * later phases resolve correctly without additional refactors.
 */

export type MessageEnvelope = never;

export function postToBackground(): never {
  throw new Error('Messaging adapter is not implemented yet. Follow the roadmap phases.');
}

export function onBackgroundEvent(): never {
  throw new Error('Messaging adapter is not implemented yet. Follow the roadmap phases.');
}
