const EN_MESSAGES: Record<string, string> = {
  'title': 'Codex Tasks Watcher',
  'totalActive.label': 'Active tasks',
  'noActiveTasks': 'No active tasks',
  'updatedAt.label': 'Updated',
  'signals.heading': 'Signals',
  'heartbeat.stale': 'Connection lost',
  'tab.lastSeen': 'Last activity: {{time}}',
  'taskCount.one': '{{count}} active task',
  'taskCount.other': '{{count}} active tasks',
  'error.failedToLoad': 'Unable to load tasks. Please reopen the popup.',
  'loading': 'Loading…',
};

const RU_MESSAGES: Record<string, string> = {
  'title': 'Наблюдатель задач Codex',
  'totalActive.label': 'Активные задачи',
  'noActiveTasks': 'Нет активных задач',
  'updatedAt.label': 'Обновлено',
  'signals.heading': 'Сигналы',
  'heartbeat.stale': 'Связь потеряна',
  'tab.lastSeen': 'Последняя активность: {{time}}',
  'taskCount.one': '{{count}} активная задача',
  'taskCount.few': '{{count}} активные задачи',
  'taskCount.many': '{{count}} активных задач',
  'taskCount.other': '{{count}} активных задач',
  'error.failedToLoad': 'Не удалось загрузить данные. Попробуйте открыть popup снова.',
  'loading': 'Загрузка…',
};

export function getDefaultPopupMessages(locale: 'en' | 'ru'): Record<string, string> {
  const base = locale === 'ru' ? RU_MESSAGES : EN_MESSAGES;
  return { ...base };
}
