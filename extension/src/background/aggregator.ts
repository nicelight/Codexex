import {
  assertAggregatedTabsState,
  type AggregatedTabsState,
  type AggregatedTabsStateDebounceState,
  type AggregatedTabsStateHeartbeatState,
  type AggregatedTabsStateTabState,
  type ContentScriptHeartbeat,
  type ContentScriptTasksUpdate,
} from '../shared/contracts';
import {
  createChildLogger,
  createLogger,
  resolveChrome,
  type ChromeLike,
  type ChromeLogger,
} from '../shared/chrome';
import { getSessionStateKey } from '../shared/storage';
import { canonicalizeCodexUrl } from '../shared/url';
import { SETTINGS_DEFAULTS } from '../shared/settings';
import type { BackgroundSettingsController } from './settings-controller';

type AggregatedTabState = AggregatedTabsStateTabState;
type AggregatedHeartbeatState = AggregatedTabsStateHeartbeatState;
type AggregatedDebounceState = AggregatedTabsStateDebounceState;

const FALLBACK_DEBOUNCE_MS = SETTINGS_DEFAULTS.debounceMs;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_STALE_MULTIPLIER = 3;
const HEARTBEAT_STALE_MIN_THRESHOLD_MS = 60_000;
const STORAGE_KEY = getSessionStateKey();
const MAX_WRITE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;

type StateMutator = (
  next: AggregatedTabsState,
  previous: AggregatedTabsState,
) => boolean;

type AggregatorListener = (event: AggregatorChangeEvent) => void;
type IdleSettledListener = (state: AggregatedTabsState) => void;

export type AggregatorEventReason =
  | 'init'
  | 'tasks-update'
  | 'heartbeat'
  | 'tab-removed'
  | 'tab-navigated'
  | 'heartbeat-stale'
  | 'debounce-cleared'
  | 'settings-updated';

export interface AggregatorChangeEvent {
  readonly reason: AggregatorEventReason;
  readonly previous: AggregatedTabsState;
  readonly current: AggregatedTabsState;
  readonly tabId?: number;
  readonly staleTabIds?: number[];
}

export interface AggregatorOptions {
  readonly chrome?: ChromeLike;
  readonly logger?: ChromeLogger;
  readonly now?: () => number;
  readonly settings?: BackgroundSettingsController;
}

export interface BackgroundAggregator {
  readonly ready: Promise<void>;
  onStateChange(listener: AggregatorListener): () => void;
  onIdleSettled(listener: IdleSettledListener): () => void;
  getSnapshot(): Promise<AggregatedTabsState>;
  getTrackedTabIds(): Promise<number[]>;
  handleTasksUpdate(
    message: ContentScriptTasksUpdate,
    sender: chrome.runtime.MessageSender,
  ): Promise<void>;
  handleHeartbeat(
    message: ContentScriptHeartbeat,
    sender: chrome.runtime.MessageSender,
  ): Promise<void>;
  handleTabRemoved(tabId: number): Promise<void>;
  handleTabNavigated(tabId: number): Promise<void>;
  evaluateHeartbeatStatuses(): Promise<number[]>;
}

export function initializeAggregator(options: AggregatorOptions = {}): BackgroundAggregator {
  return new BackgroundAggregatorImpl(options);
}

class BackgroundAggregatorImpl implements BackgroundAggregator {
  public readonly ready: Promise<void>;

  private state: AggregatedTabsState = cloneState(DEFAULT_STATE);
  private readonly chrome: ChromeLike;
  private readonly logger: ChromeLogger;
  private readonly now: () => number;
  private readonly settings?: BackgroundSettingsController;
  private readonly listeners = new Set<AggregatorListener>();
  private readonly idleListeners = new Set<IdleSettledListener>();
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTarget = 0;

  constructor(options: AggregatorOptions) {
    this.chrome = options.chrome ?? resolveChrome();
    const baseLogger = options.logger ?? createLogger('codex-background');
    this.logger = createChildLogger(baseLogger, 'aggregator');
    this.now = options.now ?? (() => Date.now());
    this.settings = options.settings;
    this.ready = this.initialize();
    this.settings?.onChange((next) => {
      void this.applyDebounceDuration(next.debounceMs);
    });
  }

  onStateChange(listener: AggregatorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onIdleSettled(listener: IdleSettledListener): () => void {
    this.idleListeners.add(listener);
    return () => {
      this.idleListeners.delete(listener);
    };
  }

  async getSnapshot(): Promise<AggregatedTabsState> {
    await this.ready;
    return cloneState(this.state);
  }

  async getTrackedTabIds(): Promise<number[]> {
    await this.ready;
    return Object.keys(this.state.tabs).map((tabId) => Number(tabId));
  }

  async handleTasksUpdate(
    message: ContentScriptTasksUpdate,
    sender: chrome.runtime.MessageSender,
  ): Promise<void> {
    await this.ready;
    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number') {
      this.logger.warn('TASKS_UPDATE without tab id', { message });
      return;
    }
    await this.updateState(
      'tasks-update',
      (next, previous) => {
        const tabKey = String(tabId);
        const hadExisting = Object.prototype.hasOwnProperty.call(previous?.tabs ?? {}, tabKey);
        const canonical = canonicalizeCodexUrl(message.origin);
        const supportsAggregation = Boolean(canonical?.isTasksListing || canonical?.isTaskDetails);
        if (!supportsAggregation) {
          let mutated = false;
          if (tabKey in next.tabs) {
            delete next.tabs[tabKey];
            mutated = true;
          }
          const nextTotal = deriveAggregatedTotal(next.tabs);
          if (next.lastTotal !== nextTotal) {
            next.lastTotal = nextTotal;
            mutated = true;
          }
          const previousTotal = previous?.lastTotal ?? 0;
          mutated = this.applyDebounceTransition(next, previousTotal) || mutated;
          if (nextTotal === 0 && next.debounce.since !== 0 && areAllCountsZero(next.tabs)) {
            next.debounce.since = 0;
            mutated = true;
          }
          return mutated;
        }
        const tabTitle = this.resolveTitle(sender, message.origin);
        const existing =
          next.tabs[tabKey] ?? this.createTabState(message.origin, tabTitle, message.ts);
        let mutated = !hadExisting;

        if (existing.origin !== message.origin) {
          existing.origin = message.origin;
          mutated = true;
        }
        if (existing.title !== tabTitle) {
          existing.title = tabTitle;
          mutated = true;
        }
        if (existing.count !== message.count) {
          existing.count = message.count;
          mutated = true;
        }
        if (existing.active !== message.active) {
          existing.active = message.active;
          mutated = true;
        }
        if (existing.updatedAt !== message.ts) {
          existing.updatedAt = message.ts;
          mutated = true;
        }
        const heartbeat = existing.heartbeat;
        const nextHeartbeatTs = Math.max(heartbeat.lastReceivedAt, message.ts);
        if (heartbeat.lastReceivedAt !== nextHeartbeatTs) {
          heartbeat.lastReceivedAt = nextHeartbeatTs;
          mutated = true;
        }
        if (heartbeat.status !== 'OK') {
          heartbeat.status = 'OK';
          mutated = true;
        }
        if (heartbeat.missedCount !== 0) {
          heartbeat.missedCount = 0;
          mutated = true;
        }
        const lastSeenAt = Math.max(nextHeartbeatTs, existing.lastSeenAt, message.ts);
        if (existing.lastSeenAt !== lastSeenAt) {
          existing.lastSeenAt = lastSeenAt;
          mutated = true;
        }

        const newSignals = message.signals.map((signal) => ({ ...signal }));
        if (!areSignalsEqual(existing.signals, newSignals)) {
          existing.signals = newSignals;
          mutated = true;
        }

        next.tabs[tabKey] = existing;
        const nextTotal = deriveAggregatedTotal(next.tabs);
        if (next.lastTotal !== nextTotal) {
          next.lastTotal = nextTotal;
          mutated = true;
        }
        const previousTotal = previous?.lastTotal ?? 0;
        mutated = this.applyDebounceTransition(next, previousTotal) || mutated;
        return mutated;
      },
      { tabId },
    );
    this.logger.debug('TASKS_UPDATE processed', { tabId, count: message.count, active: message.active });
  }

  async handleHeartbeat(
    message: ContentScriptHeartbeat,
    sender: chrome.runtime.MessageSender,
  ): Promise<void> {
    await this.ready;
    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number') {
      this.logger.warn('TASKS_HEARTBEAT without tab id', { message });
      return;
    }
    await this.updateState(
      'heartbeat',
      (next, previous) => {
        const tabKey = String(tabId);
        const hadExisting = Object.prototype.hasOwnProperty.call(previous?.tabs ?? {}, tabKey);
        const canonical = canonicalizeCodexUrl(message.origin);
        const supportsAggregation = Boolean(canonical?.isTasksListing || canonical?.isTaskDetails);
        if (!supportsAggregation) {
          let mutated = false;
          if (tabKey in next.tabs) {
            delete next.tabs[tabKey];
            mutated = true;
          }
          const nextTotal = deriveAggregatedTotal(next.tabs);
          if (next.lastTotal !== nextTotal) {
            next.lastTotal = nextTotal;
            mutated = true;
          }
          const previousTotal = previous?.lastTotal ?? 0;
          mutated = this.applyDebounceTransition(next, previousTotal) || mutated;
          if (nextTotal === 0 && next.debounce.since !== 0 && areAllCountsZero(next.tabs)) {
            next.debounce.since = 0;
            mutated = true;
          }
          return mutated;
        }
        const tabTitle = this.resolveTitle(sender, message.origin);
        const heartbeatTs = Math.max(0, message.ts);
        const updateTs = Math.max(heartbeatTs, message.lastUpdateTs);
        const existing =
          next.tabs[tabKey] ?? this.createTabState(message.origin, tabTitle, updateTs);
        let mutated = !hadExisting;

        if (existing.origin !== message.origin) {
          existing.origin = message.origin;
          mutated = true;
        }
        if (existing.title !== tabTitle) {
          existing.title = tabTitle;
          mutated = true;
        }
        if (existing.updatedAt < updateTs) {
          existing.updatedAt = updateTs;
          mutated = true;
        }
        const heartbeat = existing.heartbeat;
        const expectedInterval = clampInterval(message.intervalMs);
        if (heartbeat.expectedIntervalMs !== expectedInterval) {
          heartbeat.expectedIntervalMs = expectedInterval;
          mutated = true;
        }
        if (heartbeat.lastReceivedAt !== heartbeatTs) {
          heartbeat.lastReceivedAt = heartbeatTs;
          mutated = true;
        }
        if (heartbeat.status !== 'OK') {
          heartbeat.status = 'OK';
          mutated = true;
        }
        if (heartbeat.missedCount !== 0) {
          heartbeat.missedCount = 0;
          mutated = true;
        }
        const lastSeenAt = Math.max(existing.lastSeenAt, heartbeatTs, existing.updatedAt);
        if (existing.lastSeenAt !== lastSeenAt) {
          existing.lastSeenAt = lastSeenAt;
          mutated = true;
        }
        next.tabs[tabKey] = existing;
        return mutated;
      },
      { tabId },
    );
    this.logger.debug('TASKS_HEARTBEAT processed', { tabId, intervalMs: message.intervalMs });
  }

  async handleTabRemoved(tabId: number): Promise<void> {
    await this.ready;
    if (!Object.prototype.hasOwnProperty.call(this.state.tabs, String(tabId))) {
      return;
    }
    await this.dropTabState(tabId, 'tab-removed', 'tab removed');
  }

  async handleTabNavigated(tabId: number): Promise<void> {
    await this.ready;
    if (!Object.prototype.hasOwnProperty.call(this.state.tabs, String(tabId))) {
      return;
    }
    await this.dropTabState(tabId, 'tab-navigated', 'tab navigated away');
  }

  async evaluateHeartbeatStatuses(): Promise<number[]> {
    await this.ready;
    const staleTabIds: number[] = [];
    await this.updateState(
      'heartbeat-stale',
      (next) => {
        let mutated = false;
        const now = this.now();
        for (const [tabKey, tab] of Object.entries(next.tabs)) {
          const { heartbeat } = tab;
          const threshold = Math.max(
            HEARTBEAT_STALE_MIN_THRESHOLD_MS,
            heartbeat.expectedIntervalMs * HEARTBEAT_STALE_MULTIPLIER,
          );
          if (now - heartbeat.lastReceivedAt >= threshold) {
            staleTabIds.push(Number(tabKey));
            heartbeat.status = 'STALE';
            heartbeat.missedCount += 1;
            mutated = true;
          }
        }
        return mutated;
      },
      { staleTabIds: [...staleTabIds] },
    );
    if (staleTabIds.length > 0) {
      this.logger.warn('heartbeat stale detected', { tabIds: staleTabIds });
    }
    return staleTabIds;
  }

  private async dropTabState(
    tabId: number,
    reason: Extract<AggregatorEventReason, 'tab-removed' | 'tab-navigated'>,
    logMessage: string,
  ): Promise<void> {
    await this.ready;
    let removed = false;
    await this.updateState(
      reason,
      (next, previous) => {
        const tabKey = String(tabId);
        if (!(tabKey in next.tabs)) {
          return false;
        }
        removed = true;
        delete next.tabs[tabKey];
        const nextTotal = deriveAggregatedTotal(next.tabs);
        if (next.lastTotal !== nextTotal) {
          next.lastTotal = nextTotal;
        }
        const previousTotal = previous?.lastTotal ?? 0;
        this.applyDebounceTransition(next, previousTotal);
        if (nextTotal === 0 && next.debounce.since !== 0 && areAllCountsZero(next.tabs)) {
          next.debounce.since = 0;
        }
        return true;
      },
      { tabId },
    );
    if (removed) {
      this.logger.info(logMessage, { tabId });
      return;
    }
    this.logger.debug('dropTabState skipped for untracked tab', { tabId, reason });
  }

  private async initialize(): Promise<void> {
    await this.loadInitialState();
    if (this.settings) {
      try {
        await this.settings.ready;
        const snapshot = this.settings.getSnapshot();
        await this.applyDebounceDuration(snapshot.debounceMs);
      } catch (error) {
        this.logger.warn('failed to apply settings during init', error);
        await this.applyDebounceDuration(FALLBACK_DEBOUNCE_MS);
      }
    } else {
      await this.applyDebounceDuration(FALLBACK_DEBOUNCE_MS);
    }
    this.refreshIdleTimer();
  }

  private async loadInitialState(): Promise<void> {
    try {
      const result = await this.chrome.storage.session.get(STORAGE_KEY);
      if (Object.prototype.hasOwnProperty.call(result, STORAGE_KEY)) {
        const stored = result[STORAGE_KEY];
        if (stored) {
          try {
            assertAggregatedTabsState(stored);
            this.state = cloneState(normalizeState(stored));
            this.logger.info('restored aggregated state', {
              tabs: Object.keys(this.state.tabs).length,
              lastTotal: this.state.lastTotal,
            });
            this.notifyListeners({
              reason: 'init',
              previous: cloneState(DEFAULT_STATE),
              current: cloneState(this.state),
            });
            return;
          } catch (error) {
            this.logger.warn('stored state invalid, resetting', error);
          }
        } else {
          this.logger.warn('stored state empty, resetting');
        }
      }
    } catch (error) {
      this.logger.error('failed to read storage', error);
    }
    this.state = cloneState(DEFAULT_STATE);
    await this.persistState(this.state);
    this.notifyListeners({
      reason: 'init',
      previous: cloneState(DEFAULT_STATE),
      current: cloneState(this.state),
    });
  }

  private async updateState(
    reason: AggregatorEventReason,
    mutator: StateMutator,
    meta: Partial<AggregatorChangeEvent> = {},
  ): Promise<void> {
    const previous = cloneState(this.state);
    const next = cloneState(this.state);
    const mutated = mutator(next, previous);
    if (!mutated) {
      return;
    }
    ensureDebounceDefaults(next.debounce);
    assertAggregatedTabsState(next);
    await this.persistState(next);
    this.state = next;
    this.notifyListeners({
      reason,
      previous,
      current: cloneState(this.state),
      ...meta,
    });
    this.refreshIdleTimer();
  }

  private async persistState(state: AggregatedTabsState): Promise<void> {
    const payload = { [STORAGE_KEY]: state } as Record<string, unknown>;
    let attempt = 0;
    while (attempt < MAX_WRITE_ATTEMPTS) {
      try {
        await this.chrome.storage.session.set(payload);
        return;
      } catch (error) {
        attempt += 1;
        this.logger.warn('failed to write state', { attempt, error });
        if (attempt >= MAX_WRITE_ATTEMPTS) {
          throw error;
        }
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  private notifyListeners(event: AggregatorChangeEvent): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener({
          ...event,
          previous: cloneState(event.previous),
          current: cloneState(event.current),
          staleTabIds: event.staleTabIds ? [...event.staleTabIds] : undefined,
        });
      } catch (error) {
        this.logger.error('listener threw', error);
      }
    }
  }

  private notifyIdleListeners(state: AggregatedTabsState): void {
    for (const listener of Array.from(this.idleListeners)) {
      try {
        listener(cloneState(state));
      } catch (error) {
        this.logger.error('idle listener threw', error);
      }
    }
  }

  private applyDebounceTransition(
    state: AggregatedTabsState,
    previousTotal: number,
  ): boolean {
    const now = this.now();
    if (state.lastTotal === 0) {
      if (previousTotal > 0 && state.debounce.since === 0) {
        state.debounce.since = now;
        return true;
      }
    } else if (state.debounce.since !== 0) {
      state.debounce.since = 0;
      return true;
    }
    return false;
  }

  private async applyDebounceDuration(debounceMs: number): Promise<void> {
    const normalized = Math.min(Math.max(Math.trunc(debounceMs), 0), 60_000);
    let changed = false;
    await this.updateState(
      'settings-updated',
      (next) => {
        if (next.debounce.ms === normalized) {
          return false;
        }
        next.debounce.ms = normalized;
        changed = true;
        return true;
      },
    );
    if (!changed) {
      this.refreshIdleTimer();
    }
  }

  private refreshIdleTimer(): void {
    if (this.state.debounce.since === 0) {
      this.clearIdleTimer();
      return;
    }
    if (this.state.lastTotal > 0 || !areAllCountsZero(this.state.tabs)) {
      this.clearIdleTimer();
      return;
    }
    const target = this.state.debounce.since + this.state.debounce.ms;
    const now = this.now();
    if (now >= target) {
      this.clearIdleTimer();
      void this.handleIdleSettled();
      return;
    }
    if (this.idleTimer && this.idleTarget === target) {
      return;
    }
    this.clearIdleTimer();
    const delay = Math.max(0, target - now);
    this.idleTarget = target;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      this.idleTarget = 0;
      void this.handleIdleSettled();
    }, delay);
    this.logger.debug('idle timer scheduled', { delay, target });
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    this.idleTarget = 0;
  }

  private async handleIdleSettled(): Promise<void> {
    let settledState: AggregatedTabsState | undefined;
    let cleared = false;
    await this.updateState(
      'debounce-cleared',
      (next) => {
        if (next.debounce.since === 0) {
          return false;
        }
        if (next.lastTotal !== 0 || !areAllCountsZero(next.tabs)) {
          return false;
        }
        next.debounce.since = 0;
        cleared = true;
        settledState = cloneState(next);
        return true;
      },
    );
    if (cleared && settledState) {
      this.logger.info('debounce window cleared');
      this.notifyIdleListeners(settledState);
    }
    this.refreshIdleTimer();
  }

  private resolveTitle(
    sender: chrome.runtime.MessageSender,
    fallback: string,
  ): string {
    const raw = sender.tab?.title ?? '';
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  private createTabState(
    origin: string,
    title: string,
    timestamp: number,
  ): AggregatedTabState {
    const safeTimestamp = Math.max(0, timestamp);
    return {
      origin,
      title,
      count: 0,
      active: false,
      updatedAt: safeTimestamp,
      lastSeenAt: safeTimestamp,
      heartbeat: {
        lastReceivedAt: safeTimestamp,
        expectedIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
        status: 'OK',
        missedCount: 0,
      },
    };
  }
}

const DEFAULT_STATE: AggregatedTabsState = {
  tabs: {},
  lastTotal: 0,
  debounce: {
    ms: FALLBACK_DEBOUNCE_MS,
    since: 0,
  },
};

function ensureDebounceDefaults(debounce: AggregatedDebounceState): void {
  if (typeof debounce.ms !== 'number' || Number.isNaN(debounce.ms)) {
    debounce.ms = FALLBACK_DEBOUNCE_MS;
  }
  debounce.ms = Math.min(Math.max(debounce.ms, 0), 60_000);
  if (typeof debounce.since !== 'number' || Number.isNaN(debounce.since) || debounce.since < 0) {
    debounce.since = 0;
  }
}

function normalizeState(state: AggregatedTabsState): AggregatedTabsState {
  const normalizedTabs: Record<string, AggregatedTabState> = {};
  for (const [tabId, tab] of Object.entries(state.tabs ?? {})) {
    normalizedTabs[tabId] = normalizeTabState(tab);
  }
  const normalized: AggregatedTabsState = {
    tabs: normalizedTabs,
    lastTotal: deriveAggregatedTotal(normalizedTabs),
    debounce: {
      ms: state.debounce?.ms ?? FALLBACK_DEBOUNCE_MS,
      since: state.debounce?.since ?? 0,
    },
  };
  ensureDebounceDefaults(normalized.debounce);
  return normalized;
}

function normalizeTabState(tab: AggregatedTabState): AggregatedTabState {
  return {
    origin: tab.origin,
    title: tab.title,
    count: Math.max(0, tab.count ?? 0),
    active: Boolean(tab.active),
    updatedAt: tab.updatedAt,
    lastSeenAt: tab.lastSeenAt,
    heartbeat: normalizeHeartbeat(tab.heartbeat),
    ...(tab.signals ? { signals: tab.signals.map((signal) => ({ ...signal })) } : {}),
  };
}

function normalizeHeartbeat(heartbeat: AggregatedHeartbeatState): AggregatedHeartbeatState {
  return {
    lastReceivedAt: heartbeat.lastReceivedAt,
    expectedIntervalMs: clampInterval(heartbeat.expectedIntervalMs),
    status: heartbeat.status === 'STALE' ? 'STALE' : 'OK',
    missedCount: Math.max(0, heartbeat.missedCount ?? 0),
  };
}

function cloneState(state: AggregatedTabsState): AggregatedTabsState {
  const tabs: Record<string, AggregatedTabState> = {};
  for (const [tabId, tab] of Object.entries(state.tabs)) {
    tabs[tabId] = {
      origin: tab.origin,
      title: tab.title,
      count: tab.count,
      active: tab.active,
      updatedAt: tab.updatedAt,
      lastSeenAt: tab.lastSeenAt,
      heartbeat: { ...tab.heartbeat },
      ...(tab.signals ? { signals: tab.signals.map((signal) => ({ ...signal })) } : {}),
    };
  }
  return {
    tabs,
    lastTotal: state.lastTotal,
    debounce: { ...state.debounce },
  };
}

function deriveAggregatedTotal(tabs: Record<string, AggregatedTabState>): number {
  const listingGroups = new Map<string, number>();
  let taskDetailsCount = 0;
  let hasTaskDetails = false;
  let fallbackTotal = 0;

  for (const tab of Object.values(tabs)) {
    const canonical = canonicalizeCodexUrl(tab.origin);
    if (canonical?.isTasksListing) {
      const key = canonical.canonical;
      const previous = listingGroups.get(key) ?? 0;
      const next = tab.count > previous ? tab.count : previous;
      listingGroups.set(key, next);
      continue;
    }
    if (canonical?.isTaskDetails) {
      hasTaskDetails = true;
      taskDetailsCount = Math.max(taskDetailsCount, tab.count);
      continue;
    }
    fallbackTotal += tab.count;
  }

  if (hasTaskDetails) {
    return taskDetailsCount;
  }

  if (listingGroups.size > 0) {
    let total = 0;
    for (const count of listingGroups.values()) {
      total += count;
    }
    return total;
  }

  return fallbackTotal;
}

function areAllCountsZero(tabs: Record<string, AggregatedTabState>): boolean {
  return Object.values(tabs).every((tab) => tab.count === 0);
}

function areSignalsEqual(
  previous: AggregatedTabState['signals'] | undefined,
  next: AggregatedTabState['signals'] | undefined,
): boolean {
  if (!previous && !next) {
    return true;
  }
  if (!previous || !next) {
    return false;
  }
  if (previous.length !== next.length) {
    return false;
  }
  return previous.every((signal, index) => {
    const candidate = next[index];
    return (
      signal.detector === candidate.detector &&
      signal.evidence === candidate.evidence &&
      signal.taskKey === candidate.taskKey
    );
  });
}

function clampInterval(interval: number): number {
  if (!Number.isFinite(interval)) {
    return DEFAULT_HEARTBEAT_INTERVAL_MS;
  }
  return Math.min(Math.max(Math.trunc(interval), 1_000), 60_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


