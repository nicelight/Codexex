import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentScriptRuntime } from '../../../src/content/runtime';
import { createMockChrome, setChromeInstance } from '../../../src/shared/chrome';

const ORIGINAL_LOCATION = window.location;

function setWindowLocation(url: string): void {
  const parsed = new URL(url);
  const locationMock: Location = {
    ancestorOrigins: {
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* iterate() {
        yield* [] as string[];
      },
    },
    assign: vi.fn(),
    reload: vi.fn(),
    replace: vi.fn(),
    toString: () => parsed.toString(),
    get href() {
      return parsed.toString();
    },
    set href(value: string) {
      const next = new URL(value);
      parsed.href = next.href;
    },
    get origin() {
      return parsed.origin;
    },
    get protocol() {
      return parsed.protocol;
    },
    get host() {
      return parsed.host;
    },
    get hostname() {
      return parsed.hostname;
    },
    get port() {
      return parsed.port;
    },
    get pathname() {
      return parsed.pathname;
    },
    set pathname(value: string) {
      parsed.pathname = value;
    },
    get search() {
      return parsed.search;
    },
    set search(value: string) {
      parsed.search = value;
    },
    get hash() {
      return parsed.hash;
    },
    set hash(value: string) {
      parsed.hash = value;
    },
  } as unknown as Location;
  Object.defineProperty(window, 'location', {
    value: locationMock,
    configurable: true,
  });
}

async function flushMicrotasks(iterations = 3): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

describe('content runtime', () => {
  let chromeMock: (ReturnType<typeof createMockChrome> & { __messages: unknown[] }) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    const chrome = createMockChrome();
    const messages: unknown[] = [];
    chrome.runtime.sendMessage = ((message: unknown, callback?: () => void) => {
      messages.push(message);
      callback?.();
      return undefined as unknown;
    }) as typeof chrome.runtime.sendMessage;
    chromeMock = chrome as ReturnType<typeof createMockChrome> & { __messages: unknown[] };
    chromeMock.__messages = messages;
    setChromeInstance(chromeMock);
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    setWindowLocation('https://chatgpt.com/codex');
  });

  afterEach(() => {
    vi.useRealTimers();
    setChromeInstance(undefined);
    chromeMock = undefined;
    Object.defineProperty(window, 'location', {
      value: ORIGINAL_LOCATION,
      configurable: true,
    });
  });

  it('delays zero updates and emits heartbeat', async () => {
    const runtime = new ContentScriptRuntime({ window });
    await runtime.start();

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

  it('emits activity update in response to ping and then zero after debounce window', async () => {
    const runtime = new ContentScriptRuntime({ window });
    await runtime.start();

    document.body.innerHTML = '<div aria-busy="true"></div>';
    document.body.appendChild(document.createElement('span'));
    await flushMicrotasks();
    chromeMock!.__events.runtime.onMessage.emit(
      { type: 'PING' },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
      () => undefined,
    );
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(10);

    const messages = chromeMock!.__messages;
    const activeMessage = findLastTasksUpdate(messages, (message) => (message.count ?? 0) > 0);
    expect(activeMessage).toBeDefined();

    document.body.innerHTML = '';
    document.body.appendChild(document.createElement('span'));
    await flushMicrotasks();
    const beforeZeroMessages = messages.length;
    chromeMock!.__events.runtime.onMessage.emit(
      { type: 'PING' },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
      () => undefined,
    );
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(500);

    expect(messages.length).toBeGreaterThan(beforeZeroMessages);
    const zeroMessage = findLastTasksUpdate(messages, (message) => message.count === 0);
    expect(zeroMessage).toBeDefined();

    runtime.destroy();
  });

  it('scans task details page for activity counters', async () => {
    setWindowLocation('https://chatgpt.com/codex/tasks/task_123');
    const runtime = new ContentScriptRuntime({ window });
    await runtime.start();

    document.body.innerHTML = `
      <div class="relative size-6">
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-xs">3</span>
        </div>
      </div>
    `;
    await flushMicrotasks();
    chromeMock!.__events.runtime.onMessage.emit(
      { type: 'PING' },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
      () => undefined,
    );
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(500);

    const messages = chromeMock!.__messages;
    const positiveUpdate = findLastTasksUpdate(messages, (message) => (message.count ?? 0) > 0);
    expect(positiveUpdate).toBeDefined();
    expect(positiveUpdate?.count).toBe(3);

    runtime.destroy();
  });
});
function findLastTasksUpdate(
  messages: readonly unknown[],
  predicate: (message: { type?: string; count?: number }) => boolean,
): { type?: string; count?: number } | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index] as { type?: string; count?: number };
    if (candidate?.type === 'TASKS_UPDATE' && predicate(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
