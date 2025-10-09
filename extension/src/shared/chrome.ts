import type { ContractType } from './contracts';

export type StorageChangeListener = Parameters<chrome.storage.StorageChangedEvent['addListener']>[0];

export type RuntimeMessageListener = Parameters<chrome.runtime.ExtensionMessageEvent['addListener']>[0];
export type AlarmListener = Parameters<chrome.alarms.AlarmEvent['addListener']>[0];
export type TabRemovedListener = Parameters<chrome.tabs.TabRemovedEvent['addListener']>[0];
export type TabActivatedListener = Parameters<chrome.tabs.TabActivatedEvent['addListener']>[0];
export type TabUpdatedListener = Parameters<chrome.tabs.TabUpdatedEvent['addListener']>[0];
export type TabCreatedListener = Parameters<chrome.tabs.TabCreatedEvent['addListener']>[0];
export type PortMessageListener = Parameters<chrome.runtime.Port['onMessage']['addListener']>[0];
export type PortDisconnectListener = Parameters<chrome.runtime.Port['onDisconnect']['addListener']>[0];

export interface ChromeEventLike<Listener extends (...args: any[]) => unknown> {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
  hasListener(listener: Listener): boolean;
  hasListeners(): boolean;
}

export class ChromeEventEmitter<Listener extends (...args: any[]) => unknown>
  implements ChromeEventLike<Listener>
{
  private readonly listeners = new Set<Listener>();

  public readonly event: ChromeEventLike<Listener> = {
    addListener: (listener: Listener) => this.addListener(listener),
    removeListener: (listener: Listener) => this.removeListener(listener),
    hasListener: (listener: Listener) => this.hasListener(listener),
    hasListeners: () => this.hasListeners(),
  };

  addListener(listener: Listener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: Listener): void {
    this.listeners.delete(listener);
  }

  hasListener(listener: Listener): boolean {
    return this.listeners.has(listener);
  }

  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  emit(...args: Parameters<Listener>): void {
    for (const listener of Array.from(this.listeners)) {
      listener(...args);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export interface ChromeLike {
  runtime: {
    sendMessage: typeof chrome.runtime.sendMessage;
    connect: typeof chrome.runtime.connect;
    onMessage: ChromeEventLike<RuntimeMessageListener>;
    lastError?: chrome.runtime.LastError | undefined;
  };
  storage: {
    session: Pick<typeof chrome.storage.session, 'get' | 'set' | 'remove' | 'clear'>;
    sync?: Pick<typeof chrome.storage.sync, 'get' | 'set' | 'remove'>;
    onChanged: ChromeEventLike<StorageChangeListener>;
  };
  tabs: {
    query: typeof chrome.tabs.query;
    sendMessage: typeof chrome.tabs.sendMessage;
    update: typeof chrome.tabs.update;
    get: typeof chrome.tabs.get;
    onRemoved: ChromeEventLike<TabRemovedListener>;
    onActivated: ChromeEventLike<TabActivatedListener>;
    onUpdated: ChromeEventLike<TabUpdatedListener>;
    onCreated: ChromeEventLike<TabCreatedListener>;
  };
  alarms: {
    create: typeof chrome.alarms.create;
    clear: typeof chrome.alarms.clear;
    clearAll: typeof chrome.alarms.clearAll;
    get: typeof chrome.alarms.get;
    onAlarm: ChromeEventLike<AlarmListener>;
  };
  notifications: {
    create: typeof chrome.notifications.create;
    clear: typeof chrome.notifications.clear;
    update: typeof chrome.notifications.update;
  };
  action?: {
    setBadgeBackgroundColor: typeof chrome.action.setBadgeBackgroundColor;
    setBadgeText: typeof chrome.action.setBadgeText;
    setBadgeTextColor?: typeof chrome.action.setBadgeTextColor;
    setIcon?: typeof chrome.action.setIcon;
    setTitle?: typeof chrome.action.setTitle;
  };
  scripting?: {
    executeScript: typeof chrome.scripting.executeScript;
  };
  i18n?: {
    getUILanguage?: typeof chrome.i18n.getUILanguage;
  };
}

let chromeOverride: ChromeLike | undefined;
let injectedChrome: ChromeLike | undefined;

type ViLike = typeof import('vitest')['vi'];

function getVi(): ViLike | undefined {
  const candidate = (globalThis as { vi?: ViLike }).vi;
  return candidate && typeof candidate.fn === 'function' ? candidate : undefined;
}

function withSpy<T extends (...args: any[]) => unknown>(impl: T): T {
  const viLike = getVi();
  return viLike ? (viLike.fn(impl) as unknown as T) : impl;
}

export function getChrome(): ChromeLike {
  if (typeof globalThis.chrome === 'undefined') {
    throw new Error('Chrome APIs are not available in this environment');
  }
  return globalThis.chrome as unknown as ChromeLike;
}

export function resolveChrome(): ChromeLike {
  return chromeOverride ?? getChrome();
}

export function setChromeInstance(instance: ChromeLike | undefined): void {
  chromeOverride = instance;
  if (instance) {
    injectedChrome = instance;
    (globalThis as Record<string, unknown>).chrome = instance as unknown as typeof chrome;
    return;
  }
  if (injectedChrome && (globalThis as Record<string, unknown>).chrome === injectedChrome) {
    delete (globalThis as Record<string, unknown>).chrome;
    injectedChrome = undefined;
  }
}

function createPortMock(): chrome.runtime.Port {
  const onMessage = new ChromeEventEmitter<PortMessageListener>();
  const onDisconnect = new ChromeEventEmitter<PortDisconnectListener>();

  return {
    name: 'mock-port',
    disconnect: () => {
      onDisconnect.emit({ name: 'mock-port' } as chrome.runtime.Port);
    },
    postMessage: () => undefined,
    onDisconnect: onDisconnect.event as chrome.runtime.Port['onDisconnect'],
    onMessage: onMessage.event as chrome.runtime.Port['onMessage'],
  } as chrome.runtime.Port;
}

function createCallbackInvoker(): typeof chrome.runtime.sendMessage {
  const handler = ((...args: unknown[]) => {
    let callback: ((response?: unknown) => void) | undefined;
    for (let index = args.length - 1; index >= 0; index -= 1) {
      if (typeof args[index] === 'function') {
        callback = args[index] as (response?: unknown) => void;
        break;
      }
    }
    if (callback) {
      callback();
    }
  }) as typeof chrome.runtime.sendMessage;
  return handler;
}

function createInMemoryStorageArea(
  areaName: 'session' | 'sync',
  onChanged: ChromeEventEmitter<StorageChangeListener>,
): Pick<typeof chrome.storage.session, 'get' | 'set' | 'remove' | 'clear'> {
  const store = new Map<string, unknown>();

  function resolveGetKeys(keys?: string | string[] | Record<string, unknown> | null) {
    if (keys === null || typeof keys === 'undefined') {
      return Array.from(store.keys());
    }
    if (typeof keys === 'string') {
      return [keys];
    }
    if (Array.isArray(keys)) {
      return keys;
    }
    return Object.keys(keys);
  }

  return {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      const result: Record<string, unknown> = {};
      if (keys && typeof keys === 'object' && !Array.isArray(keys) && keys !== null) {
        for (const [key, defaultValue] of Object.entries(keys)) {
          result[key] = store.has(key) ? store.get(key) : defaultValue;
        }
        return result;
      }
      for (const key of resolveGetKeys(keys)) {
        if (store.has(key)) {
          result[key] = store.get(key);
        }
      }
      return result;
    },
    async set(items: Record<string, unknown>) {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [key, value] of Object.entries(items)) {
        const oldValue = store.has(key) ? store.get(key) : undefined;
        store.set(key, value);
        changes[key] = { oldValue, newValue: value };
      }
      if (Object.keys(changes).length > 0) {
        onChanged.emit(changes, areaName);
      }
    },
    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const key of list) {
        if (store.has(key)) {
          const oldValue = store.get(key);
          store.delete(key);
          changes[key] = { oldValue, newValue: undefined };
        }
      }
      if (Object.keys(changes).length > 0) {
        onChanged.emit(changes, areaName);
      }
    },
    async clear() {
      if (store.size === 0) {
        return;
      }
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [key, value] of Array.from(store.entries())) {
        changes[key] = { oldValue: value, newValue: undefined };
      }
      store.clear();
      onChanged.emit(changes, areaName);
    },
  };
}

function mergeChromeLike(base: ChromeMock, overrides?: Partial<ChromeLike>): ChromeMock {
  if (!overrides) {
    return base;
  }
  const result: ChromeMock = {
    ...base,
    runtime: { ...base.runtime, ...overrides.runtime },
    storage: {
      session: overrides.storage?.session ?? base.storage.session,
      sync: overrides.storage?.sync ?? base.storage.sync,
      onChanged: overrides.storage?.onChanged ?? base.storage.onChanged,
    },
    tabs: { ...base.tabs, ...overrides.tabs },
    alarms: { ...base.alarms, ...overrides.alarms },
    notifications: { ...base.notifications, ...overrides.notifications },
    action: base.action || overrides.action ? { ...base.action, ...overrides.action } : base.action,
    scripting: overrides.scripting ?? base.scripting,
    i18n: overrides.i18n ?? base.i18n,
  };
  return result;
}

export interface ChromeMock extends ChromeLike {
  __events: {
    runtime: {
      onMessage: ChromeEventEmitter<RuntimeMessageListener>;
    };
    alarms: {
      onAlarm: ChromeEventEmitter<AlarmListener>;
    };
    storage: {
      onChanged: ChromeEventEmitter<StorageChangeListener>;
    };
    tabs: {
      onRemoved: ChromeEventEmitter<TabRemovedListener>;
      onActivated: ChromeEventEmitter<TabActivatedListener>;
      onUpdated: ChromeEventEmitter<TabUpdatedListener>;
      onCreated: ChromeEventEmitter<TabCreatedListener>;
    };
  };
}

export function createMockChrome(overrides?: Partial<ChromeLike>): ChromeMock {
  const runtimeOnMessage = new ChromeEventEmitter<RuntimeMessageListener>();
  const alarmsOnAlarm = new ChromeEventEmitter<AlarmListener>();
  const storageOnChanged = new ChromeEventEmitter<StorageChangeListener>();
  const tabsOnRemoved = new ChromeEventEmitter<TabRemovedListener>();
  const tabsOnActivated = new ChromeEventEmitter<TabActivatedListener>();
  const tabsOnUpdated = new ChromeEventEmitter<TabUpdatedListener>();
  const tabsOnCreated = new ChromeEventEmitter<TabCreatedListener>();
  const alarmsState = new Map<string, chrome.alarms.AlarmCreateInfo | undefined>();

  const base: ChromeMock = {
    runtime: {
      sendMessage: withSpy(createCallbackInvoker()) as typeof chrome.runtime.sendMessage,
      connect: withSpy((() => createPortMock()) as typeof chrome.runtime.connect),
      onMessage: runtimeOnMessage.event,
      lastError: undefined,
    },
    storage: {
      session: createInMemoryStorageArea('session', storageOnChanged),
      sync: createInMemoryStorageArea('sync', storageOnChanged),
      onChanged: storageOnChanged.event,
    },
    tabs: {
      query: withSpy((async () => []) as typeof chrome.tabs.query),
      sendMessage: withSpy((async (...args: Parameters<typeof chrome.tabs.sendMessage>) => {
        let callback: ((response?: unknown) => void) | undefined;
        for (let index = args.length - 1; index >= 0; index -= 1) {
          if (typeof args[index] === 'function') {
            callback = args[index] as (response?: unknown) => void;
            break;
          }
        }
        if (callback) {
          callback();
        }
        return undefined as unknown;
      }) as typeof chrome.tabs.sendMessage),
      update: withSpy((async (tabId: number, updateProperties?: chrome.tabs.UpdateProperties) => ({
        id: tabId,
        ...updateProperties,
      })) as typeof chrome.tabs.update),
      get: withSpy((async (tabId: number) => ({
        id: tabId,
        url: `https://example.com/${tabId}`,
      })) as typeof chrome.tabs.get),
      onRemoved: tabsOnRemoved.event,
      onActivated: tabsOnActivated.event,
      onUpdated: tabsOnUpdated.event,
      onCreated: tabsOnCreated.event,
    },
    alarms: {
      create: withSpy(((name: string, alarmInfo?: chrome.alarms.AlarmCreateInfo) => {
        alarmsState.set(name, alarmInfo);
      }) as typeof chrome.alarms.create),
      clear: withSpy((async (name: string) => {
        const existed = alarmsState.delete(name);
        return existed;
      }) as typeof chrome.alarms.clear),
      clearAll: withSpy((async () => {
        const hadEntries = alarmsState.size > 0;
        alarmsState.clear();
        return hadEntries;
      }) as typeof chrome.alarms.clearAll),
      get: withSpy((async (name: string) => {
        if (!alarmsState.has(name)) {
          return undefined;
        }
        return { name } as chrome.alarms.Alarm;
      }) as typeof chrome.alarms.get),
      onAlarm: alarmsOnAlarm.event,
    },
    notifications: {
      create: withSpy((async (id: string | undefined) => id ?? 'mock-notification') as typeof chrome.notifications.create),
      clear: withSpy((async () => true) as typeof chrome.notifications.clear),
      update: withSpy((async () => true) as typeof chrome.notifications.update),
    },
    action: {
      setBadgeBackgroundColor: withSpy((async () => undefined) as typeof chrome.action.setBadgeBackgroundColor),
      setBadgeText: withSpy((async () => undefined) as typeof chrome.action.setBadgeText),
      setBadgeTextColor: withSpy((async () => undefined) as typeof chrome.action.setBadgeTextColor),
      setIcon: withSpy((async () => undefined) as typeof chrome.action.setIcon),
      setTitle: withSpy((async () => undefined) as typeof chrome.action.setTitle),
    },
    scripting: {
      executeScript: (async () => []) as typeof chrome.scripting.executeScript,
    },
    i18n: {
      getUILanguage: () => 'en',
    },
    __events: {
      runtime: {
        onMessage: runtimeOnMessage,
      },
      alarms: {
        onAlarm: alarmsOnAlarm,
      },
      storage: {
        onChanged: storageOnChanged,
      },
      tabs: {
        onRemoved: tabsOnRemoved,
        onActivated: tabsOnActivated,
        onUpdated: tabsOnUpdated,
        onCreated: tabsOnCreated,
      },
    },
  };

  return mergeChromeLike(base, overrides);
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ChromeLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export const noopLogger: ChromeLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

type LoggerContext = { consoleRef: Pick<Console, LogLevel> };

const LOGGER_CONTEXT_SYMBOL = Symbol('codex.logger.context');

type InternalLogger = ChromeLogger & { [LOGGER_CONTEXT_SYMBOL]?: LoggerContext };

export function createLogger(namespace: string, consoleRef: Pick<Console, LogLevel> = console): ChromeLogger {
  const prefix = namespace ? `[${namespace}]` : '';
  const logger: InternalLogger = {
    debug: (...args: unknown[]) => consoleRef.debug(prefix, ...args),
    info: (...args: unknown[]) => consoleRef.info(prefix, ...args),
    warn: (...args: unknown[]) => consoleRef.warn(prefix, ...args),
    error: (...args: unknown[]) => consoleRef.error(prefix, ...args),
  };
  logger[LOGGER_CONTEXT_SYMBOL] = { consoleRef };
  return logger;
}

export function createChildLogger(parent: ChromeLogger, namespace: string): ChromeLogger {
  const parentContext = (parent as InternalLogger)[LOGGER_CONTEXT_SYMBOL];
  const consoleRef = parentContext?.consoleRef ?? console;
  return createLogger(namespace, consoleRef);
}

export interface ControlledFunction<T extends (...args: any[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel(): void;
  flush(): void;
  pending(): boolean;
}

export interface TimingOptions {
  leading?: boolean;
  trailing?: boolean;
  now?: () => number;
}

function toControlledFunction<T extends (...args: any[]) => unknown>(
  executor: T,
  controls: {
    cancel(): void;
    flush(): void;
    pending(): boolean;
  },
): ControlledFunction<T> {
  const fn = ((...args: Parameters<T>) => executor(...args)) as ControlledFunction<T>;
  fn.cancel = controls.cancel;
  fn.flush = controls.flush;
  fn.pending = controls.pending;
  return fn;
}

export function throttle<T extends (...args: any[]) => unknown>(
  fn: T,
  waitMs: number,
  options: TimingOptions = {},
): ControlledFunction<T> {
  const { leading = true, trailing = true, now = Date.now } = options;
  let lastCallTime = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let trailingArgs: Parameters<T> | undefined;

  const invoke = (time: number, args: Parameters<T>) => {
    lastCallTime = time;
    trailingArgs = undefined;
    fn(...args);
  };

  const scheduleTrailing = () => {
    if (!trailingArgs || timer) {
      return;
    }
    const delay = Math.max(0, waitMs - (now() - lastCallTime));
    timer = setTimeout(() => {
      timer = undefined;
      if (trailing) {
        const args = trailingArgs;
        trailingArgs = undefined;
        if (args) {
          invoke(now(), args);
        }
      }
    }, delay);
  };

  const throttled = (...args: Parameters<T>) => {
    const currentTime = now();
    if (!lastCallTime && !leading) {
      lastCallTime = currentTime;
    }

    const remaining = waitMs - (currentTime - lastCallTime);
    trailingArgs = args;

    if (remaining <= 0 || remaining > waitMs) {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      invoke(currentTime, args);
    } else if (!timer && trailing) {
      scheduleTrailing();
    }
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    trailingArgs = undefined;
    lastCallTime = 0;
  };

  const flush = () => {
    if (timer && trailingArgs) {
      clearTimeout(timer);
      timer = undefined;
      invoke(now(), trailingArgs);
    }
    trailingArgs = undefined;
  };

  const pending = () => Boolean(timer);

  return toControlledFunction(throttled as T, { cancel, flush, pending });
}

export function debounce<T extends (...args: any[]) => unknown>(
  fn: T,
  waitMs: number,
  options: TimingOptions = {},
): ControlledFunction<T> {
  const { leading = false, trailing = true } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Parameters<T> | undefined;

  const invoke = (args: Parameters<T>) => {
    pendingArgs = undefined;
    fn(...args);
  };

  const debounced = (...args: Parameters<T>) => {
    const shouldInvoke = leading && !timer;
    pendingArgs = args;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = undefined;
      if (trailing && pendingArgs) {
        invoke(pendingArgs);
      }
    }, waitMs);

    if (shouldInvoke) {
      invoke(args);
    }
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    pendingArgs = undefined;
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pendingArgs) {
      invoke(pendingArgs);
      pendingArgs = undefined;
    }
  };

  const pending = () => Boolean(timer);

  return toControlledFunction(debounced as T, { cancel, flush, pending });
}

let idleHandleCounter = 1;
const idleHandleMap = new Map<number, ReturnType<typeof setTimeout>>();

export type IdleCallbackHandle = number;

export interface IdleCallbackGlobal {
  requestIdleCallback?: typeof globalThis.requestIdleCallback;
  cancelIdleCallback?: typeof globalThis.cancelIdleCallback;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

export function requestIdleCallbackPolyfill(
  callback: IdleRequestCallback,
  options?: IdleRequestOptions,
): IdleCallbackHandle {
  const start = Date.now();
  const timeout = options?.timeout ?? 0;
  const handle = idleHandleCounter++;
  const delay = timeout > 0 ? Math.min(timeout, 50) : 1;
  const timer = setTimeout(() => {
    idleHandleMap.delete(handle);
    const didTimeout = timeout > 0 && Date.now() - start >= timeout;
    const deadline: IdleDeadline = {
      didTimeout,
      timeRemaining(): number {
        const elapsed = Date.now() - start;
        return Math.max(0, 50 - elapsed);
      },
    } as IdleDeadline;
    callback(deadline);
  }, delay);
  idleHandleMap.set(handle, timer);
  return handle;
}

export function cancelIdleCallbackPolyfill(handle: IdleCallbackHandle): void {
  const timer = idleHandleMap.get(handle);
  if (timer) {
    clearTimeout(timer);
    idleHandleMap.delete(handle);
  }
}

export function ensureRequestIdleCallback(target: IdleCallbackGlobal = globalThis): void {
  if (!target.requestIdleCallback) {
    target.requestIdleCallback = requestIdleCallbackPolyfill;
  }
  if (!target.cancelIdleCallback) {
    target.cancelIdleCallback = cancelIdleCallbackPolyfill;
  }
}

export type ContractAwareChrome = ChromeLike & { contracts?: Partial<Record<ContractType, unknown>> };
