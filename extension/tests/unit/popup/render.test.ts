import { describe, expect, it, beforeEach } from 'vitest';
import { renderPopup } from '../../../src/popup/app';
import { getDefaultPopupMessages } from '../../../src/popup/messages';
import type { PopupRenderState } from '../../../src/shared/contracts';
import { SETTINGS_DEFAULTS } from '../../../src/shared/settings';

describe('popup rendering', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
  });

  it('renders empty state with Russian messages', () => {
    const root = document.createElement('div');
    const state: PopupRenderState = {
      generatedAt: new Date('2024-01-01T10:00:00.000Z').toISOString(),
      totalActive: 0,
      tabs: [],
      locale: 'ru',
      messages: getDefaultPopupMessages('ru'),
    };

    renderPopup(root, state, SETTINGS_DEFAULTS);

    expect(root.querySelector('.popup__empty')?.textContent).toBe('Нет активных задач');
    expect(document.documentElement.lang).toBe('ru');
  });

  it('renders tab list with signals and warnings', () => {
    const root = document.createElement('div');
    const state: PopupRenderState = {
      generatedAt: new Date('2024-01-01T12:34:56.000Z').toISOString(),
      totalActive: 5,
      locale: 'en',
      messages: getDefaultPopupMessages('en'),
      tabs: [
        {
          tabId: 2,
          title: 'Review PR',
          origin: 'https://chatgpt.com/codex/review',
          count: 3,
          lastSeenAt: 1_700_000,
          heartbeatStatus: 'STALE',
          signals: [
            { detector: 'D2_STOP_BUTTON', evidence: 'Stop button visible' },
          ],
        },
        {
          tabId: 1,
          title: 'Build tasks',
          origin: 'https://chatgpt.com/codex/tasks',
          count: 2,
          lastSeenAt: 1_600_000,
          heartbeatStatus: 'OK',
          signals: [],
        },
      ],
    };

    renderPopup(root, state, SETTINGS_DEFAULTS);

    const tabs = root.querySelectorAll('.popup__tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].querySelector('.popup__tab-title')?.textContent).toBe('Review PR');
    expect(tabs[0].querySelector('.popup__tab-count')?.textContent).toBe('3 active tasks');
    expect(tabs[0].querySelector('.popup__tab-warning')?.textContent).toBe('Connection lost');
    expect(tabs[0].querySelector('.popup__signal-detector')?.textContent).toBe('D2_STOP_BUTTON');
    expect(tabs[1].querySelector('.popup__tab-count')?.textContent).toBe('2 active tasks');
    expect(root.querySelector('.popup__empty')).toBeNull();
    expect(document.documentElement.lang).toBe('en');
  });
});
