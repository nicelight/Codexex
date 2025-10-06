import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentScriptRuntime } from '../../../src/content/runtime';
import { createMockChrome, setChromeInstance } from '../../../src/shared/chrome';

describe('content runtime', () => {
  let chromeMock: (ReturnType<typeof createMockChrome> & { __messages: unknown[] }) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    const chrome = createMockChrome();
    const messages: unknown[] = [];
    chrome.runtime.sendMessage = ((message: unknown, callback?: () => void) => {
      messages.push(message);
      if (callback) {
        callback();
      }
      return undefined as unknown;
    }) as typeof chrome.runtime.sendMessage;
    chromeMock = chrome as ReturnType<typeof createMockChrome> & { __messages: unknown[] };
    chromeMock.__messages = messages;
    setChromeInstance(chromeMock);
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    setChromeInstance(undefined);
    chromeMock = undefined;
  });

  it('delays zero updates and emits heartbeat', async () => {
    const runtime = new ContentScriptRuntime({ window });
    await runtime.start();

    expect(chromeMock).toBeDefined();
    const messages = chromeMock!.__messages;

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'TASKS_HEARTBEAT' });

    await vi.advanceTimersByTimeAsync(500);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ type: 'TASKS_UPDATE', count: 0 });

    await vi.advanceTimersByTimeAsync(15_000);
    expect(messages).toHaveLength(3);
    expect(messages[2]).toMatchObject({ type: 'TASKS_HEARTBEAT' });

    runtime.destroy();
  });

  it('cancels zero debounce when activity appears', async () => {
    const runtime = new ContentScriptRuntime({ window });
    await runtime.start();

    document.body.innerHTML = '<div aria-busy="true"></div>';
    // Trigger MutationObserver
    document.body.appendChild(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(5);

    expect(chromeMock).toBeDefined();
    const messages = chromeMock!.__messages;

    expect(messages.some((msg) => (msg as { type?: string }).type === 'TASKS_UPDATE')).toBe(true);
    const lastMessage = messages[messages.length - 1] as {
      type: string;
      count?: number;
    };
    expect(lastMessage.type).toBe('TASKS_UPDATE');
    expect(lastMessage.count).toBeGreaterThan(0);

    document.body.innerHTML = '';
    document.body.appendChild(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(499);
    const previousLength = messages.length;
    await vi.advanceTimersByTimeAsync(1);
    expect(messages.length).toBeGreaterThan(previousLength);
    const zeroMessage = messages[messages.length - 1] as {
      type: string;
      count?: number;
    };
    expect(zeroMessage.type).toBe('TASKS_UPDATE');
    expect(zeroMessage.count).toBe(0);

    runtime.destroy();
  });
});
