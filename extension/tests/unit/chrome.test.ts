import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChromeEventEmitter,
  ChromeLogger,
  IdleCallbackGlobal,
  IdleCallbackHandle,
  createChildLogger,
  createLogger,
  createMockChrome,
  debounce,
  ensureRequestIdleCallback,
  resolveChrome,
  setChromeInstance,
  throttle,
} from '@/shared/chrome';

describe('chrome shared utilities', () => {
  afterEach(() => {
    setChromeInstance(undefined);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('provides controllable throttle and debounce helpers', () => {
    vi.useFakeTimers();
    const throttledCalls: number[] = [];
    const debouncedCalls: number[] = [];

    const throttled = throttle((value: number) => throttledCalls.push(value), 100);
    const debounced = debounce((value: number) => debouncedCalls.push(value), 100);

    throttled(1);
    throttled(2);
    expect(throttledCalls).toEqual([1]);
    vi.advanceTimersByTime(100);
    expect(throttledCalls).toEqual([1, 2]);

    debounced(1);
    debounced(2);
    vi.advanceTimersByTime(50);
    debounced(3);
    vi.advanceTimersByTime(100);
    expect(debouncedCalls).toEqual([3]);

    throttled.cancel();
    debounced.cancel();
  });

  it('installs requestIdleCallback polyfill for test environment', () => {
    vi.useFakeTimers();
    const target: IdleCallbackGlobal = {
      setTimeout,
      clearTimeout,
    };

    ensureRequestIdleCallback(target);
    expect(typeof target.requestIdleCallback).toBe('function');
    expect(typeof target.cancelIdleCallback).toBe('function');

    const callback = vi.fn();
    const handle: IdleCallbackHandle | undefined = target.requestIdleCallback?.((deadline) => {
      callback(deadline.didTimeout);
    }, { timeout: 5 });

    expect(handle).toBeDefined();
    vi.advanceTimersByTime(10);
    expect(callback).toHaveBeenCalledWith(true);

    if (handle) {
      target.cancelIdleCallback?.(handle);
    }
  });

  it('creates mock chrome with event emitters', () => {
    const mock = createMockChrome();
    let messageHandled = false;

    mock.runtime.onMessage.addListener((message) => {
      messageHandled = (message as string) === 'PING';
      return true;
    });

    mock.__events.runtime.onMessage.emit('PING', {} as chrome.runtime.MessageSender, () => undefined);
    expect(messageHandled).toBe(true);

    setChromeInstance(mock);
    expect(resolveChrome()).toBe(mock);
  });

  it('builds prefixed loggers and delegates to console', () => {
    const calls: Record<string, unknown[][]> = {
      debug: [],
      info: [],
      warn: [],
      error: [],
    };

    const consoleLike = {
      debug: (...args: unknown[]) => calls.debug.push(args),
      info: (...args: unknown[]) => calls.info.push(args),
      warn: (...args: unknown[]) => calls.warn.push(args),
      error: (...args: unknown[]) => calls.error.push(args),
    } satisfies Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;

    const logger = createLogger('core', consoleLike);
    logger.debug('hello');
    logger.info('world');

    const child: ChromeLogger = createChildLogger(logger, 'child');
    child.warn('warning');

    expect(calls.debug[0]?.[0]).toBe('[core]');
    expect(calls.info[0]?.[0]).toBe('[core]');
    expect(calls.warn[0]?.[0]).toBe('[child]');
  });

  it('exposes ChromeEventEmitter helpers for tests', () => {
    const emitter = new ChromeEventEmitter<(value: number) => void>();
    const listener = vi.fn();

    emitter.addListener(listener);
    expect(emitter.hasListeners()).toBe(true);
    emitter.emit(42);
    expect(listener).toHaveBeenCalledWith(42);
    emitter.removeListener(listener);
    expect(emitter.hasListeners()).toBe(false);
  });
});
