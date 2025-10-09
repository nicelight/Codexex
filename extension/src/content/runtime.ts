import {
  assertContentScriptHeartbeat,
  assertContentScriptTasksUpdate,
  type ContentScriptHeartbeat,
  type ContentScriptTasksUpdate,
} from '../shared/contracts';
import {
  createChildLogger,
  createLogger,
  ensureRequestIdleCallback,
  resolveChrome,
  type ChromeLogger,
} from '../shared/chrome';
import { ActivityScanner, type TaskActivitySnapshot } from './activity-scanner';
import { createDetectorPipeline } from './detectors';
import { onBackgroundEvent, postToBackground } from './messaging';

const ZERO_DEBOUNCE_MS = 500;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MIN_SCAN_INTERVAL_MS = 1_000;
const VERBOSE_KEY = 'codex.tasks.verbose';

export interface ContentScriptOptions {
  readonly window: Window;
}

export class ContentScriptRuntime {
  private readonly window: Window;
  private readonly logger: ChromeLogger;
  private readonly verboseLogger: ChromeLogger;
  private readonly scanner: ActivityScanner;
  private readonly mutationObserver: MutationObserver;

  private zeroTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  private idleHandle: number | undefined;
  private unsubscribeBackground: (() => void) | undefined;

  private lastSnapshot: TaskActivitySnapshot | undefined;
  private lastSentSnapshot: TaskActivitySnapshot | undefined;
  private lastUpdateTs = 0;
  private lastScanAt = 0;
  private isDestroyed = false;
  private verbose = false;

  constructor(options: ContentScriptOptions) {
    this.window = options.window;
    ensureRequestIdleCallback(this.window);
    this.verboseLogger = this.createVerbosityAwareLogger();
    this.logger = createChildLogger(this.verboseLogger, 'runtime');
    const pipeline = createDetectorPipeline({
      document: this.window.document,
      logger: createChildLogger(this.verboseLogger, 'detectors'),
      enableCardHeuristic: false,
    });
    this.scanner = new ActivityScanner(pipeline, this.verboseLogger);
    this.mutationObserver = new MutationObserver(() => {
      this.logger.debug('mutation observed');
      this.scheduleScan('mutation');
    });
  }

  public async start(): Promise<void> {
    await this.refreshVerboseFlag();
    this.logger.info('bootstrap content script');
    this.observeMutations();
    this.unsubscribeBackground = onBackgroundEvent(
      (event) => this.handleBackgroundEvent(event),
      this.verboseLogger,
    );
    await this.scanNow('startup');
    await this.sendHeartbeat(false);
    this.scheduleHeartbeat();
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.logger.info('destroy runtime');
    this.mutationObserver.disconnect();
    if (this.unsubscribeBackground) {
      this.unsubscribeBackground();
    }
    if (this.zeroTimer) {
      clearTimeout(this.zeroTimer);
    }
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    if (this.idleHandle) {
      this.window.cancelIdleCallback?.(this.idleHandle);
    }
  }

  private observeMutations(): void {
    const root = this.window.document.documentElement;
    if (!root) {
      return;
    }
    this.mutationObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  }

  private createVerbosityAwareLogger(): ChromeLogger {
    const consoleLike = {
      debug: (...args: unknown[]) => {
        if (this.verbose) {
          console.debug(...args);
        }
      },
      info: (...args: unknown[]) => console.info(...args),
      warn: (...args: unknown[]) => console.warn(...args),
      error: (...args: unknown[]) => console.error(...args),
    } satisfies Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
    return createLogger('codex-content', consoleLike);
  }

  private async readVerboseFlag(): Promise<boolean> {
    try {
      const chrome = resolveChrome();
      const result = await chrome.storage.session.get({ [VERBOSE_KEY]: false });
      return Boolean(result[VERBOSE_KEY]);
    } catch (error) {
      this.logger.debug('verbose flag read failed', error);
      return false;
    }
  }

  private async refreshVerboseFlag(): Promise<void> {
    this.verbose = await this.readVerboseFlag();
  }

  private scheduleScan(reason: 'mutation' | 'ping' | 'manual'): void {
    if (this.isDestroyed) {
      return;
    }
    if (this.idleHandle) {
      return;
    }
    this.logger.debug('schedule scan', reason);
    this.idleHandle = this.window.requestIdleCallback?.(
      () => {
        this.idleHandle = undefined;
        this.scanNow(reason).catch((error) => {
          this.logger.error('scan failed', error);
        });
      },
      { timeout: 500 },
    );
  }

  private async scanNow(reason: string): Promise<void> {
    if (this.isDestroyed) {
      return;
    }
    const now = Date.now();
    if (reason !== 'ping' && now - this.lastScanAt < MIN_SCAN_INTERVAL_MS) {
      this.logger.debug('scan throttled');
      return;
    }
    this.lastScanAt = now;
    const snapshot = this.scanner.scan(now);
    this.lastSnapshot = snapshot;
    await this.dispatchSnapshot(snapshot);
  }

  private async dispatchSnapshot(snapshot: TaskActivitySnapshot): Promise<void> {
    if (this.isDestroyed) {
      return;
    }
    if (snapshot.count === 0 && !snapshot.active) {
      if (this.lastSentSnapshot && this.lastSentSnapshot.count === 0) {
        return;
      }
      if (this.zeroTimer) {
        clearTimeout(this.zeroTimer);
      }
      this.zeroTimer = setTimeout(() => {
        this.zeroTimer = undefined;
        this.sendUpdate(snapshot).catch((error) => {
          this.logger.error('zero debounce send failed', error);
        });
      }, ZERO_DEBOUNCE_MS);
      return;
    }

    if (this.zeroTimer) {
      clearTimeout(this.zeroTimer);
      this.zeroTimer = undefined;
    }
    await this.sendUpdate(snapshot);
  }

  private async sendUpdate(snapshot: TaskActivitySnapshot): Promise<void> {
    const message: ContentScriptTasksUpdate = {
      type: 'TASKS_UPDATE',
      origin: this.window.location.href,
      active: snapshot.active,
      count: snapshot.count,
      signals: snapshot.signals,
      ts: Date.now(),
    };
    assertContentScriptTasksUpdate(message);
    await postToBackground(message, this.logger);
    this.lastSentSnapshot = snapshot;
    this.lastUpdateTs = message.ts;
  }

  private async sendHeartbeat(respondingToPing: boolean): Promise<void> {
    const message: ContentScriptHeartbeat = {
      type: 'TASKS_HEARTBEAT',
      origin: this.window.location.href,
      ts: Date.now(),
      lastUpdateTs: this.lastUpdateTs || this.lastSnapshot?.ts || Date.now(),
      intervalMs: HEARTBEAT_INTERVAL_MS,
      ...(respondingToPing ? { respondingToPing: true } : {}),
    };
    assertContentScriptHeartbeat(message);
    await postToBackground(message, this.logger);
  }

  private scheduleHeartbeat(): void {
    if (this.isDestroyed) {
      return;
    }
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    this.heartbeatTimer = setTimeout(() => {
      this.sendHeartbeat(false)
        .catch((error) => {
          this.logger.error('heartbeat failed', error);
        })
        .finally(() => {
          this.scheduleHeartbeat();
        });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private async handleBackgroundEvent(event: { type: string }): Promise<void> {
    switch (event.type) {
      case 'PING':
        await this.scanNow('ping');
        await this.sendHeartbeat(true);
        this.scheduleHeartbeat();
        break;
      case 'RESET':
        this.scanner.reset();
        await this.refreshVerboseFlag();
        await this.scanNow('manual');
        break;
      case 'REQUEST_STATE':
        if (this.lastSnapshot) {
          await this.sendUpdate(this.lastSnapshot);
        } else {
          await this.scanNow('manual');
        }
        break;
      default:
        break;
    }
  }
}
