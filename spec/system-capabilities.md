# System Capabilities & States — Codex Tasks Watcher

## Functional Capabilities

| Capability ID | Описание | Триггеры | Основные акторы | Артефакты состояния |
|---------------|----------|----------|-----------------|---------------------|
| CAP-01 | Детектирование активности задач на вкладке Codex. | MutationObserver, периодический опрос при простое. | Контент-скрипт. | `TaskActivitySnapshot` (см. схемы DTO). |
| CAP-02 | Агрегация состояния всех вкладок и расчёт `totalActiveCount`. | Получение `TASKS_UPDATE`, восстановление через alarm `codex-poll`. | Background service worker. | `AggregatedState.tabs`, `AggregatedState.lastTotal`. |
| CAP-03 | Антидребезг и выдача уведомления при переходе `totalActiveCount` >0 → 0. | Изменение суммы активных задач, таймер debounce. | Background service worker, Chrome Notifications. | `AggregatedState.debounce`. |
| CAP-04 | Применение `autoDiscardableOff` для вкладок Codex. | Старт расширения, получение обновления состояния, изменения настроек (v0.2.0+). | Background service worker, Chrome Tabs API. | Нет дополнительного состояния, действует напрямую. |
| CAP-05 | Отображение агрегированного состояния в popup. | Пользователь открывает popup. | Popup UI, background. | Кэш состояния (чтение из `chrome.storage.session.state`). |
| CAP-06 | Периодический пинг вкладок для восстановления состояния после сна сервис-воркера. | Срабатывание `chrome.alarms` (`codex-poll`). | Background service worker. | Запрос `PING` → вкладка отвечает актуальным `TASKS_UPDATE`. |

## Состояния системы

### TaskActivitySnapshot (в контент-скрипте)
- `origin`: URL вкладки.
- `active`: булев флаг наличия активных задач.
- `count`: количество задач (по максимуму между детекторами).
- `signals`: массив детализированных доказательств.
- `ts`: Unix-время (мс) формирования снимка.

### AggregatedState (в background)
- `tabs`: словарь `tabId -> { origin, title, count, active, updatedAt, signals[] }`.
- `lastTotal`: сумма `count` всех вкладок.
- `debounce`: `{ ms, since }` — параметры антидребезга.
- `version`: целевой релиз (например, `v0.1.0`).

### NotificationState
- Косвенно хранится через системные уведомления; идемпотентность достигается проверкой `lastTotal` и `debounce.since`.

## Триггеры переходов состояний

| Событие | Изменяемое состояние | Логика |
|---------|----------------------|--------|
| `TASKS_UPDATE` из контент-скрипта | `AggregatedState.tabs`, `AggregatedState.lastTotal`, `AggregatedState.debounce.since` | Обновить вкладку, пересчитать сумму, при переходе в 0 запустить антидребезг. |
| Таймер `debounce` истёк | `AggregatedState.debounce.since`, системное уведомление | Проверить, что `lastTotal==0` и все `count==0`; создать уведомление, сбросить `since`. |
| Закрытие вкладки (`tabs.onRemoved`) | `AggregatedState.tabs`, `AggregatedState.lastTotal` | Удалить вкладку, пересчитать сумму, при нуле сбросить `debounce.since`. |
| Alarm `codex-poll` | Нет непосредственного состояния, отправка `PING` | Обеспечивает повторное обновление `TaskActivitySnapshot` при возобновлении воркера. |
| Открытие popup | Нет изменений (только чтение) | Popup читает `AggregatedState` и отображает данные. |
| Обновление настроек (v0.2.0+) | `debounce.ms`, поведение `autoDiscardable` | Синхронизация `settings`, применение к вкладкам. |

## Жизненный цикл

1. При установке расширения создаётся `AggregatedState` с пустыми вкладками и `lastTotal=0`.
2. Первое `TASKS_UPDATE` инициирует добавление вкладки и расчёт суммы.
3. Если вкладки отсутствуют (`tabs` пуст), уведомления не создаются, popup показывает пустое состояние.
4. При длительном бездействии сервис-воркер может быть выгружен; alarm гарантирует его периодический запуск и восстановление состояния.
5. Пользователь взаимодействует с уведомлением или popup без влияния на счётчики задач.
