import type { PopupRenderState, PopupRenderStateTab } from '../shared/contracts';
import { getDefaultPopupMessages } from './messages';
import { requestPopupState, activateAudioSupport } from './state';
import './styles.css';

export async function mountPopup(root: HTMLElement): Promise<void> {
  const fallbackLocale = detectLocale();
  const fallbackMessages = getDefaultPopupMessages(fallbackLocale);
  renderLoading(root, fallbackMessages);

  try {
    const state = await requestPopupState();
    renderPopup(root, state);
    void activateAudioSupport().catch((error) => {
      console.warn('Audio activation failed', error);
    });
  } catch (error) {
    console.error('Failed to load popup state', error);
    renderError(root, fallbackMessages, fallbackLocale);
  }
}

export function renderPopup(root: HTMLElement, state: PopupRenderState): void {
  const defaultMessages = getDefaultPopupMessages(state.locale);
  const messages = { ...defaultMessages, ...(state.messages ?? {}) };

  if (typeof document !== 'undefined') {
    document.documentElement.lang = state.locale;
    document.title = messages['title'] ?? 'Codex Tasks Watcher';
  }

  const container = document.createElement('div');
  container.className = 'popup';

  container.append(createHeader(state, messages), createContent(state, messages));

  root.replaceChildren(container);
}

function createHeader(state: PopupRenderState, messages: Record<string, string>): HTMLElement {
  const header = document.createElement('header');
  header.className = 'popup__header';

  const title = document.createElement('h1');
  title.className = 'popup__title';
  title.textContent = messages['title'] ?? 'Codex Tasks Watcher';
  header.append(title);

  const meta = document.createElement('div');
  meta.className = 'popup__meta';

  const total = document.createElement('div');
  total.className = 'popup__total';

  const totalLabel = document.createElement('span');
  totalLabel.className = 'popup__total-label';
  totalLabel.textContent = messages['totalActive.label'] ?? 'Active tasks';

  const totalCount = document.createElement('span');
  totalCount.className = 'popup__total-count';
  totalCount.textContent = String(state.totalActive);

  total.append(totalLabel, totalCount);

  const updated = document.createElement('div');
  updated.className = 'popup__updated';
  const updatedLabel = messages['updatedAt.label'] ?? 'Updated';
  updated.textContent = `${updatedLabel}: ${formatTimestamp(state.generatedAt, state.locale)}`;

  meta.append(total, updated);
  header.append(meta);

  return header;
}

function createContent(state: PopupRenderState, messages: Record<string, string>): HTMLElement {
  const main = document.createElement('main');
  main.className = 'popup__content';

  if (state.tabs.length === 0 || state.totalActive === 0) {
    const empty = document.createElement('div');
    empty.className = 'popup__empty';
    empty.textContent = messages['noActiveTasks'] ?? 'No active tasks';
    main.append(empty);
    return main;
  }

  const list = document.createElement('ul');
  list.className = 'popup__tabs';

  for (const tab of state.tabs) {
    list.append(createTabItem(tab, state, messages));
  }

  main.append(list);
  return main;
}

function createTabItem(
  tab: PopupRenderStateTab,
  state: PopupRenderState,
  messages: Record<string, string>,
): HTMLElement {
  const item = document.createElement('li');
  item.className = 'popup__tab';

  const header = document.createElement('div');
  header.className = 'popup__tab-header';

  const title = document.createElement('div');
  title.className = 'popup__tab-title';
  title.textContent = tab.title;

  const count = document.createElement('div');
  count.className = 'popup__tab-count';
  count.textContent = formatTaskCount(tab.count, state.locale, messages);

  header.append(title, count);
  item.append(header);

  const subtitle = document.createElement('div');
  subtitle.className = 'popup__tab-subtitle';
  subtitle.textContent = formatTabSubtitle(tab, state.locale, messages);
  item.append(subtitle);

  if (tab.heartbeatStatus === 'STALE') {
    const warning = document.createElement('div');
    warning.className = 'popup__tab-warning';
    warning.textContent = messages['heartbeat.stale'] ?? 'Connection lost';
    item.append(warning);
  }

  if (tab.signals.length > 0) {
    item.append(createSignalsSection(tab, messages));
  }

  return item;
}

function createSignalsSection(tab: PopupRenderStateTab, messages: Record<string, string>): HTMLElement {
  const container = document.createElement('div');
  container.className = 'popup__signals';

  const heading = document.createElement('div');
  heading.className = 'popup__signals-title';
  heading.textContent = messages['signals.heading'] ?? 'Signals';

  const list = document.createElement('ul');
  list.className = 'popup__signals-list';

  for (const signal of tab.signals) {
    const entry = document.createElement('li');
    entry.className = 'popup__signal';

    const detector = document.createElement('span');
    detector.className = 'popup__signal-detector';
    detector.textContent = signal.detector;

    const evidence = document.createElement('span');
    evidence.className = 'popup__signal-evidence';
    evidence.textContent = signal.evidence;

    entry.append(detector, evidence);
    list.append(entry);
  }

  container.append(heading, list);
  return container;
}

function formatTabSubtitle(
  tab: PopupRenderStateTab,
  locale: 'en' | 'ru',
  messages: Record<string, string>,
): string {
  const host = safeHostname(tab.origin);
  const lastSeen = typeof tab.lastSeenAt === 'number' ? formatTime(tab.lastSeenAt, locale) : undefined;
  if (lastSeen) {
    const template = messages['tab.lastSeen'] ?? 'Last activity: {{time}}';
    const substituted = template.replace('{{time}}', lastSeen);
    return host ? `${host} • ${substituted}` : substituted;
  }
  return host ?? '';
}

function formatTimestamp(value: string, locale: 'en' | 'ru'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatTime(value: number, locale: 'en' | 'ru'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatTaskCount(
  count: number,
  locale: 'en' | 'ru',
  messages: Record<string, string>,
): string {
  const rules = new Intl.PluralRules(locale);
  const category = rules.select(count);
  const keys = [`taskCount.${category}`, 'taskCount.other'];
  for (const key of keys) {
    const template = messages[key];
    if (template) {
      return template.replace('{{count}}', String(count));
    }
  }
  return String(count);
}

function renderLoading(root: HTMLElement, messages: Record<string, string>): void {
  const container = document.createElement('div');
  container.className = 'popup popup--loading';
  const text = document.createElement('div');
  text.className = 'popup__loading';
  text.textContent = messages['loading'] ?? 'Loading…';
  container.append(text);
  root.replaceChildren(container);
}

function renderError(
  root: HTMLElement,
  messages: Record<string, string>,
  locale: 'en' | 'ru',
): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  const container = document.createElement('div');
  container.className = 'popup popup--error';
  const text = document.createElement('div');
  text.className = 'popup__error';
  text.textContent = messages['error.failedToLoad'] ?? 'Unable to load tasks. Please reopen the popup.';
  container.append(text);
  root.replaceChildren(container);
}

function detectLocale(): 'en' | 'ru' {
  const language = globalThis.navigator?.language ?? 'en';
  return language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('app');
  if (root) {
    void mountPopup(root);
  }
}
