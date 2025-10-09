import { vi } from 'vitest';

import {
  createMockChrome,
  setChromeInstance,
  type ChromeLike,
  type ChromeMock,
} from '@/shared/chrome';

export interface ChromeSetupOptions {
  readonly overrides?: Partial<ChromeLike>;
  readonly installFakeTimers?: boolean;
}

export interface ChromeTestEnvironment {
  readonly chrome: ChromeMock;
  readonly restore: () => void;
}

/**
 * Reuses the shared chrome mock factory and wires it into the global resolver.
 * Optionally installs fake timers so tests can control alarms/heartbeats deterministically.
 */
export function setupChromeTestEnvironment(options: ChromeSetupOptions = {}): ChromeTestEnvironment {
  if (options.installFakeTimers) {
    vi.useFakeTimers();
  }

  const chrome = createMockChrome(options.overrides);
  setChromeInstance(chrome);

  return {
    chrome,
    restore: () => {
      setChromeInstance(undefined);
      if (options.installFakeTimers) {
        vi.useRealTimers();
      }
    },
  };
}

/**
 * Flushes a few microtask turns to make sure async callbacks settle before assertions.
 * Useful for tests that rely on chained Promise resolutions instead of fake timers.
 */
export async function flushMicrotasks(iterations = 3): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

/**
 * Advances fake timers and ensures pending microtasks are processed afterwards.
 */
export async function advanceTimersByTime(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await flushMicrotasks();
}

