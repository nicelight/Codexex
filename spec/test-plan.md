# Test Plan & Acceptance Criteria — Codex Tasks Watcher

## Цели тестирования
- Подтвердить соответствие контент-скрипта и background спецификациям JSON Schema.
- Проверить корректность антидребезга и уникальность уведомлений.
- Убедиться, что popup отображает актуальное состояние задач.
- Для релизов v0.2.0+: подтвердить управление пользовательскими настройками и их применение.

## Область покрытия
- Юнит-тесты детекторов и агрегатора.
- Контрактные тесты HTTP-адаптера (OpenAPI).
- Интеграционные сценарии с имитацией вкладок и сообщений.

## Acceptance Criteria
1. **AC1 — Уведомление по завершении всех задач**
   - Given несколько вкладок с активными задачами (`count>0`),
   - When каждая вкладка отправляет `TASKS_UPDATE` с `count=0`, а антидребезг истёк,
   - Then создаётся ровно одно уведомление «Все задачи в Codex завершены» и `debounce.since` сбрасывается в `0`.
2. **AC2 — Антидребезг защищает от ложных срабатываний**
   - Given вкладка отправляет `TASKS_UPDATE` с `count=0`,
   - When в течение окна антидребезга приходит новое сообщение с `count>0`,
   - Then уведомление не создаётся и окно начинается заново.
3. **AC3 — Popup отображает актуальные данные**
   - Given в `AggregatedState` содержатся вкладки с `count>0`,
   - When popup запрашивает `/popup/state`,
   - Then в ответе перечислены вкладки с корректными `count`, `title` и, при наличии, `signals`.
4. **AC4 — Контент-скрипт соблюдает Schema**
   - Given контент-скрипт отправляет `TASKS_UPDATE`,
   - When сообщение валидируется по `contracts/dto/content-update.schema.json`,
   - Then валидация проходит без ошибок, обязательные поля присутствуют, `ts` задан числом (epoch миллисекунды).
5. **AC5 — Обработка закрытия вкладок**
   - Given вкладка с `count>0` закрывается (без финального сообщения),
   - When background получает событие `tabs.onRemoved`,
   - Then состояние вкладки удаляется, `lastTotal` пересчитывается, уведомление не создаётся, если есть другие активные задачи.
6. **AC6 — Синхронизация пользовательских настроек (v0.2.0+)**
   - Given в `chrome.storage.sync.settings` записаны значения по схеме `CodexTasksUserSettings`,
   - When пользователь изменяет `debounceMs`, `autoDiscardableOff`, `sound` или `showBadgeCount` через UI,
   - Then background валидирует объект, обновляет `AggregatedState.debounce.ms`, применяет `autoDiscardable` к вкладкам и синхронно обновляет бейдж и звуковой режим.
7. **AC7 — Обнаружение и восстановление heartbeat**
   - Given вкладка перестала отправлять `TASKS_HEARTBEAT` на 45 секунд,
   - When alarm `codex-poll` срабатывает и отправляет `PING`, контент-скрипт отвечает `TASKS_UPDATE` + `TASKS_HEARTBEAT`,
   - Then background сразу после получения `TASKS_HEARTBEAT` обновляет `tabs[tabId].heartbeat.lastSeenAt`, сбрасывает `missedCount`, переводит статус в `OK` и возвращает вкладку в агрегированное состояние «жива».

## Типы тестов
- **Unit**
  - Детекторы: корректное определение активности по тестовым DOM-фрагментам.
  - Агрегатор: переходы состояний `lastTotal`, антидребезг и применение формулы `max(D2_count, D3_count, D1_indicatorCount)` (включая сценарий «только D3»).
  - Settings: валидация объекта настроек, применение дефолтов и пересчёт `debounceMs`.
  - Heartbeat: обработка `TASKS_HEARTBEAT` с немедленным обновлением `lastSeenAt`, сбросом `missedCount` и переходом статуса `STALE` → `OK`.
- **Contract**
  - Валидация OpenAPI: `POST /background/tasks-update`, `POST /background/tasks-heartbeat`, `GET /background/state`, `GET /popup/state`.
  - JSON Schema: сериализация `AggregatedState`, `PopupRenderState` и `CodexTasksUserSettings`.
- **Integration**
  - Симуляция Chrome APIs (tabs, alarms, notifications, storage.sync) через фейки. Проверка сценариев UC-1..UC-4 и изменения настроек.
  - Отработка UC-5: имитация пропуска heartbeat, срабатывание alarm, повторное сканирование и сброс статуса `STALE`.

## Тестовые данные
- DOM-фрагменты для детекторов D1/D2/D3 на RU/EN интерфейсах.
- Моки Chrome API: `tabs.query`, `notifications.create`, `storage.session`, `storage.sync`.
- Набор последовательностей сообщений для воспроизведения сценариев (см. `spec/use-cases.md`).

## Метрики и отчётность
- Покрытие unit-тестов по файлам детекторов ≥80%.
- Контрактные тесты выполняются в CI при каждом PR.
- Отчёт о прогоне включается в PR (лог pytest + результаты валидации OpenAPI).

## Инструменты
- Jest/Vitest (или аналог) для unit-тестов в среде jsdom.
- `ajv` для проверки JSON Schema в тестах.
- `schemathesis` или `dredd` для контрактного тестирования OpenAPI адаптера.

## Риски и mitigations
- Изменение DOM на стороне Codex → предусмотреть возможность обновления фикстур DOM.
- Ограничения Manifest V3 (спящий воркер) → интеграционные тесты моделируют таймеры `chrome.alarms`.
