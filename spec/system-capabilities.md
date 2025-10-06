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
| CAP-07 | Поддержка heartbeat для контроля живости вкладок. | Таймер контент-скрипта, реакция на `PING`, контроль пропусков по `AggregatedState`. | Контент-скрипт, background. | `ContentScriptHeartbeat`, `AggregatedState.tabs[].heartbeat`. |
| CAP-08 | Управление пользовательскими настройками (v0.2.0+) и их применением. | Изменения UI/синхронизация `chrome.storage.sync`. | Background service worker, popup/options UI. | `Settings` по схеме `CodexTasksUserSettings`. |

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
- `debounce`: `{ ms, since }` — параметры антидребезга, где `since` фиксирует Unix-время (мс) начала окна и сбрасывается в `0`, когда окно неактивно; `ms` наследуется из пользовательских настроек с дефолтом 12 000 мс (v0.2.0+).
- `tabs[].heartbeat`: объект `{ lastReceivedAt, expectedIntervalMs, missedCount, status }`, где `status` принимает значения `OK` или `STALE` при превышении окна `expectedIntervalMs * 3`.

### UserSettings (v0.2.0+)
- `chrome.storage.sync.settings` хранит объект по схеме `CodexTasksUserSettings`.
- Поля: `debounceMs` (0–60000 мс), `sound` (звук уведомления), `autoDiscardableOff` (принудительное `autoDiscardable=false`), `showBadgeCount` (показывать счётчик на иконке).
- Настройки влияют на антидребезг, применение запрета авто-выгрузки, управление бейджем и звуковым сигналом.

### NotificationState
- Косвенно хранится через системные уведомления; идемпотентность достигается проверкой `lastTotal` и `debounce.since`.

## Триггеры переходов состояний

| Событие | Изменяемое состояние | Логика |
|---------|----------------------|--------|
| `TASKS_UPDATE` из контент-скрипта | `AggregatedState.tabs`, `AggregatedState.lastTotal`, `AggregatedState.debounce.since` | Обновить вкладку, пересчитать сумму, при переходе в 0 запустить антидребезг. |
| `TASKS_HEARTBEAT` из контент-скрипта | `AggregatedState.tabs[].lastSeenAt`, `AggregatedState.tabs[].heartbeat` | Обновить `lastReceivedAt`, сбросить `missedCount`, выставить `status=OK`. |
| Таймер `debounce` истёк | `AggregatedState.debounce.since`, системное уведомление | Проверить, что `lastTotal==0` и все `count==0`; создать уведомление, сбросить `since`. |
| Закрытие вкладки (`tabs.onRemoved`) | `AggregatedState.tabs`, `AggregatedState.lastTotal` | Удалить вкладку, пересчитать сумму, при нуле сбросить `debounce.since`. |
| Alarm `codex-poll` | `AggregatedState.tabs[].heartbeat.status` | Обеспечивает повторное обновление `TaskActivitySnapshot` при возобновлении воркера; при `STALE` вкладках отправляет `PING` и при необходимости инициирует повторное сканирование. |
| Открытие popup | Нет изменений (только чтение) | Popup читает `AggregatedState` и отображает данные. |
| Обновление настроек (v0.2.0+) | `Settings`, `AggregatedState.debounce.ms`, `autoDiscardable`, бейдж, звук | Принять значения по схеме, сохранить в `chrome.storage.sync`, обновить антидребезг, бейдж и звуковой режим. |

## Жизненный цикл

1. При установке расширения создаётся `AggregatedState` с пустыми вкладками и `lastTotal=0`.
2. Первое `TASKS_UPDATE` инициирует добавление вкладки и расчёт суммы.
3. Если вкладки отсутствуют (`tabs` пуст), уведомления не создаются, popup показывает пустое состояние.
4. При длительном бездействии сервис-воркер может быть выгружен; alarm гарантирует его периодический запуск, проверяет `tabs[].heartbeat.status` и инициирует `PING`/повторное сканирование, если heartbeat устарел.
5. Пользователь взаимодействует с уведомлением или popup без влияния на счётчики задач; при открытии popup вкладки со статусом `STALE` запрашиваются повторно.
