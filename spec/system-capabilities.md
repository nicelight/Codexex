# System Capabilities & States — Codex Tasks Watcher

## Functional Capabilities

| Capability ID | Описание | Триггеры | Основные акторы | Артефакты состояния |
|---------------|----------|----------|-----------------|---------------------|
| CAP-01 | Детектирование активности задач на вкладке Codex. | MutationObserver, периодический опрос при простое. | Контент-скрипт. | `TaskActivitySnapshot` (см. схемы DTO). |
| CAP-02 | Агрегация состояния всех вкладок и расчёт `totalActiveCount`. | Получение `TASKS_UPDATE`, восстановление через alarm `codex-poll`. | Background service worker. | `AggregatedState.tabs`, `AggregatedState.lastTotal`. |
| CAP-03 | Антидребезг и выдача уведомления при переходе `totalActiveCount` >0 → 0. | Изменение суммы активных задач, таймер debounce. | Background service worker, Chrome Notifications. | `AggregatedState.debounce`. |
| CAP-04 | Применение `autoDiscardableOff` для отслеживаемых вкладок Codex. | Инициализация aggregator, любое изменение `AggregatedState.tabs`, очистка вкладки. | Background service worker, Chrome Tabs API. | Нет дополнительного состояния, действует напрямую. |
| CAP-05 | Отображение агрегированного состояния в popup. | Пользователь открывает popup → `POPUP_GET_STATE`. | Popup UI, background. | Генерируемый `PopupRenderState` (на основе `AggregatedState`). |
| CAP-06 | Периодический пинг вкладок и маркировка `STALE`. | Срабатывание `chrome.alarms` (`codex-poll`). | Background service worker. | `AggregatedState.tabs[].heartbeat.status`, сообщения `PING`. |
| CAP-07 | Поддержка heartbeat для контроля живости вкладок. | Таймер контент-скрипта, реакция на `PING`, контроль пропусков по `AggregatedState`. | Контент-скрипт, background. | `ContentScriptHeartbeat`, `AggregatedState.tabs[].heartbeat`. |

## Состояния системы

### TaskActivitySnapshot (в контент-скрипте)
- `origin`: URL вкладки.
- `active`: булев флаг наличия активных задач.
- `count`: количество задач (по максимуму между детекторами).
- `signals`: массив детализированных доказательств.
- `ts`: Unix-время (мс) формирования снимка.

### ContentScriptHeartbeat
- `origin`: URL вкладки, из которой отправлен heartbeat.
- `ts`: Unix-время (мс) отправки heartbeat.
- `lastUpdateTs`: отметка времени последнего `TASKS_UPDATE`, доступного контент-скрипту.
- `intervalMs`: ожидаемый интервал до следующего heartbeat (по умолчанию 15000 мс).
- `respondingToPing`: булево, сигнализирует, что heartbeat отправлен в ответ на `PING` (опционально для диагностики).

### AggregatedState (в background)
- `tabs`: словарь `tabId -> { origin, title, count, active, updatedAt, lastSeenAt, heartbeat, signals? }`, где `updatedAt` — Unix-время (мс) последнего `TASKS_UPDATE`, `lastSeenAt` — максимум между `updatedAt` и временем последнего `TASKS_HEARTBEAT`, а `signals` хранит последний снимок детекторов и может отсутствовать для вкладок без детальных сигналов.
- `lastTotal`: сумма `count` всех вкладок.
- `debounce`: `{ ms, since }` — параметры антидребезга, где `since` фиксирует Unix-время (мс) начала окна и сбрасывается в `0`, когда окно неактивно; в v0.1.0 используется значение по умолчанию 12 000 мс (ограничивается диапазоном 0–60 000).
- `tabs[].heartbeat`: объект `{ lastReceivedAt, expectedIntervalMs, missedCount, status }`, где `status` принимает значения `OK` или `STALE` при превышении окна `expectedIntervalMs * 3`.

### UserSettings (зарезервировано для v0.2.0+)
- Схема `CodexTasksUserSettings` подготовлена, но в коде v0.1.0 не используется.
- Поля: `debounceMs`, `sound`, `autoDiscardableOff`, `showBadgeCount`; предполагается хранение в `chrome.storage.sync`.
- В текущей реализации значения `debounceMs` и `autoDiscardableOff` зашиты константами.

### NotificationState
- Косвенно хранится через системные уведомления; идемпотентность достигается проверкой `lastTotal` и `debounce.since`.

## Триггеры переходов состояний

| Событие | Изменяемое состояние | Логика |
|---------|----------------------|--------|
| `TASKS_UPDATE` из контент-скрипта | `AggregatedState.tabs`, `AggregatedState.lastTotal`, `AggregatedState.debounce.since` | Обновить вкладку, пересчитать сумму, при переходе в 0 запустить антидребезг, переустановить `autoDiscardable=false` для вкладки. |
| `AggregatedState` изменился (через `onStateChange`) | Нет (операция над вкладкой) | Контроллер `alarms` проходит по `tabs` и вызывает `chrome.tabs.update({ autoDiscardable: false })` для всех отслеживаемых вкладок; очищает список при удалении. |
| `TASKS_HEARTBEAT` из контент-скрипта | `AggregatedState.tabs[].lastSeenAt`, `AggregatedState.tabs[].heartbeat` | Обновить `lastReceivedAt`, сбросить `missedCount`, выставить `status=OK`. |
| Таймер `debounce` истёк | `AggregatedState.debounce.since`, системное уведомление | Проверить, что `lastTotal==0` и все `count==0`; создать уведомление, сбросить `since`. |
| Закрытие вкладки (`tabs.onRemoved`) | `AggregatedState.tabs`, `AggregatedState.lastTotal` | Удалить вкладку, пересчитать сумму, при нуле сбросить `debounce.since`. |
| Alarm `codex-poll` | `AggregatedState.tabs[].heartbeat.status` | Вызывает `evaluateHeartbeatStatuses()`: помечает вкладки как `STALE`, увеличивает `missedCount`, отправляет `PING`. |
| Открытие popup | `PopupRenderState` (временный объект) | Background формирует снимок (`generatePopupRenderState`) и возвращает по сообщению `POPUP_GET_STATE`. |
| Изменение `chrome.storage.session['codex.tasks.verbose']` | Уровень логирования background/content | Логгер пересчитывает verbose-режим и начинает выводить debug-сообщения. |

## Жизненный цикл

1. При установке расширения создаётся `AggregatedState` с пустыми вкладками и `lastTotal=0`.
2. Первое `TASKS_UPDATE` инициирует добавление вкладки и расчёт суммы.
3. Если вкладки отсутствуют (`tabs` пуст), уведомления не создаются, popup показывает пустое состояние.
4. При длительном бездействии сервис-воркер может быть выгружен; alarm гарантирует его периодический запуск, проверяет `tabs[].heartbeat.status` и инициирует `PING`/повторное сканирование, если heartbeat устарел.
5. Пользователь взаимодействует с уведомлением или popup без влияния на счётчики задач; открытие popup отображает актуальный снимок и не инициирует дополнительные сообщения, если фон уже получил свежие heartbeat/updates.
## CAP-08: Toolbar action indicator
- Toolbar badge renders aggregated totalActiveCount using chrome.action APIs.
- Badge text stays on transparent background (RGBA [0,0,0,0]) and the base icon is replaced with transparent squares (16/24/32 px).
- Text palette by load: 0 #16A34A, 1 #F97316, 2 #F2542D, 3 #E11D48, 4+ #C2185B.
- Badge text caps at 99+; tooltip follows locale template "{n} active Codex tasks"
