# Test Plan & Acceptance Criteria — Codex Tasks Watcher

## Цели тестирования
- Подтвердить соответствие контент-скрипта и background спецификациям JSON Schema.
- Проверить корректность антидребезга и уникальность уведомлений.
- Убедиться, что popup отображает актуальное состояние задач и корректно сортирует вкладки.
- Подтвердить устойчивость heartbeat/`PING` цикла и принудительное отключение `autoDiscardable`.

## Область покрытия
- Юнит-тесты ActivityScanner и агрегатора.
- Контрактные проверки DTO/State (JSON Schema, Ajv).
- Интеграционные сценарии с имитацией вкладок, alarm и уведомлений.

## Acceptance Criteria
1. **AC1 — Уведомление по завершении всех задач**
   - Given несколько вкладок с активными задачами (`count>0`),
   - When каждая вкладка отправляет `TASKS_UPDATE` с `count=0`, а антидребезг истёк,
   - Then создаётся ровно одно уведомление «Все задачи в Codex завершены» и `debounce.since` сбрасывается в `0`.
2. **AC2 — Антидребезг защищает от ложных срабатываний**
   - Given вкладка отправляет `TASKS_UPDATE` с `count=0`,
   - When в течение окна антидребезга приходит новое сообщение с `count>0`,
   - Then уведомление не создаётся и окно начинается заново.
3. **AC3 — Popup отображает актуальные данные и сортировку**
   - Given в `AggregatedState` содержатся вкладки с `count>0` и различными `lastSeenAt`,
   - When popup запрашивает `POPUP_GET_STATE`,
   - Then в ответе перечислены вкладки в порядке убывания `count`, затем `lastSeenAt`, у каждой вкладки указаны `title`, `origin`, `heartbeatStatus`, `signals`, а `totalActive` равен сумме `count`.
4. **AC4 — Контент-скрипт соблюдает Schema**
   - Given контент-скрипт отправляет `TASKS_UPDATE`,
   - When сообщение валидируется по `contracts/dto/content-update.schema.json`,
   - Then валидация проходит без ошибок, обязательные поля присутствуют, `ts` задан числом (epoch миллисекунды).
5. **AC5 — Обработка закрытия вкладок**
   - Given вкладка с `count>0` закрывается (без финального сообщения),
   - When background получает событие `tabs.onRemoved`,
   - Then состояние вкладки удаляется, `lastTotal` пересчитывается, уведомление не создаётся, если есть другие активные задачи.
6. **AC6 — Автоотключение выгрузки вкладки (MVP v0.1.0)**
   - Given вкладка Codex отправляет `TASKS_UPDATE` с актуальными данными,
   - When background обновляет агрегированное состояние без участия UI,
    - Then в течение нескольких секунд вызывается `chrome.tabs.update({ autoDiscardable: false })` для этой вкладки и она добавляется в список защищённых; при удалении вкладки защита снимается.
7. **AC7 — Обнаружение и восстановление heartbeat**
  - Given вкладка перестала отправлять `TASKS_HEARTBEAT` на 15 секунд,
   - When alarm `codex-poll` срабатывает и отправляет `PING`, контент-скрипт отвечает `TASKS_UPDATE` + `TASKS_HEARTBEAT`,
   - Then background сразу после получения `TASKS_HEARTBEAT` обновляет `tabs[tabId].lastSeenAt` и `tabs[tabId].heartbeat.lastReceivedAt`, сбрасывает `missedCount`, переводит статус в `OK` и возвращает вкладку в агрегированное состояние «жива».

## Типы тестов
- **Unit**
  - ActivityScanner: корректное определение активности по простым DOM-фрагментам (спиннеры, кнопки Stop/Cancel, счётчики), учёт локали.
  - Aggregator/notifications: переходы состояний `lastTotal`, `debounce`, восстановление из storage, работа retry, локализация уведомлений.
  - Popup: генерация `PopupRenderState`, сортировка вкладок, отображение статуса `STALE`.
- **Contract**
  - JSON Schema: сериализация `ContentScriptTasksUpdate`, `ContentScriptHeartbeat`, `AggregatedTabsState`, `PopupRenderState`.
- **Integration**
  - Симуляция Chrome APIs (tabs, alarms, notifications, storage.session) через фейки. Проверка сценариев UC-1..UC-5, включая `PING`, очистку дебаунса и autoDiscardable.
  - Проверка восстановления состояния после рестарта service worker (чтение `chrome.storage.session`).

## Тестовые данные
- DOM-фрагменты для эвристик ActivityScanner (спиннеры, стоп-кнопки RU/EN, счётчик задач).
- Моки Chrome API: `tabs.update`, `tabs.sendMessage`, `notifications.create`, `notifications.clear`, `alarms`, `storage.session`.
- Набор последовательностей сообщений для воспроизведения сценариев (см. `spec/use-cases.md`).

## Метрики и отчётность
- Покрытие unit-тестов ActivityScanner ≥80%.
- Контрактные проверки JSON Schema выполняются в CI при каждом PR.
- GitHub Actions workflow `.github/workflows/ci.yml` автоматически запускает `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, `npm run test:contract` и `npm run test:integration` для каждой ветки `pull_request` и обновлений `main`, а по завершении успешно пройденных проверок включает auto-merge PR и публикует комментарий `@codex` в обсуждении.
- Отчёт о прогоне включается в PR (лог тестов + результаты AJV).

## Инструменты
- Jest/Vitest (или аналог) для unit/integration тестов в среде jsdom и node.
- `ajv` для проверки JSON Schema в тестах.
- Пользовательские моки Chrome API или `webextension-polyfill` shim для интеграционных сценариев.

## Риски и mitigations
- Изменение DOM на стороне Codex → предусмотреть возможность обновления фикстур DOM.
- Ограничения Manifest V3 (спящий воркер) → интеграционные тесты моделируют таймеры `chrome.alarms`.
- Попытки усложнить ActivityScanner (новые конвейеры, дополнительная иерархия детекторов) без согласования → блокируем задачу, консультируемся с заказчиком и обновляем план тестирования.
