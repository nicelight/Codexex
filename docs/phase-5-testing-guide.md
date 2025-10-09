# Phase 5 Testing Guide — Remaining Scope

> Цель этого файла — описать **только те проверки, которые ещё не закрыты** по роадмапу (фаза 5). Вся выполненная работа перенесена в логи и не упоминается здесь, чтобы не мешать фокусу. Следуй шагам последовательно — после каждого mini-check запускай связанные команды Vitest, фиксируй наблюдения.

## 0. Быстрый чек-лист перед стартом

- Убедись, что зависимости установлены (`npm install`).  
- Ты находишься в корне репозитория (`Codexex`).  
- Vitest конфиги уже лежат рядом в корне (`vitest.unit.config.ts`, `vitest.contract.config.ts`, `vitest.integration.config.ts`).

> Команды, которые будем использовать:
> ```bash
> npm run test:contract
> npm run test:integration
> ```
>
> (unit-пакет уже зелёный, поэтому его повторный прогон не обязателен, но можно запустить `npm run test:unit`, если потребуется).

## 1. Контрактные тесты: добить сценарии из `spec/test-plan.md`

Выполни один за другим тестовые кейсы, чтобы закрыть последние галочки из Acceptance Criteria (AC1‒AC5).

### 1.1 Что ещё не проверено
- **AC1/AC2** (дебаунс при переходе из активности в idle по всем вкладкам) — нужно убедиться, что API `/background/state` отражает `debounce.since > 0`, когда после активного `TASKS_UPDATE` приходит `count=0`.
- **AC5** (удаление вкладки/очистка состояния): после `tabs.onRemoved` агрегатор должен сбрасывать вкладку и `lastTotal`.
- В AGG/POPUP DTO-схемах мы уже проверили валидность, но не покрыли отрицательные сценарии, связанные с debounce в API.

### 1.2 Как добавить позитивный тест на дебаунс (AC1/AC2)
1. Открой `extension/tests/contract/contracts.test.ts`.
2. Найди блок `describe('OpenAPI adapter contracts', ...)`. После теста `serves responses matching OpenAPI schemas` добавь новый `it`, условно `it('records debounce window transitions for AC1/AC2', async () => { ... })`.
3. Внутри используй `useBackgroundHttpHandlers` (есть helper):
   ```ts
   useBackgroundHttpHandlers({
     aggregator,
     chrome: chromeMock,
     tabId: 91,
     tabTitle: 'AC1',
   });
   ```
4. Отправь два запроса:
   - POST `/background/tasks-update` с `count: 3` (активные задачи).
   - POST `/background/tasks-update` с `count: 0` (всё завершилось).
5. Затем GET `/background/state`, распарси JSON и ожидай:
   ```ts
   expect(state.debounce.since).toBeGreaterThan(0);
   expect(state.lastTotal).toBe(0);
   ```
6. Снова GET `/popup/state` — убедись, что данные валидируются схематикой (`assertPopupRenderState` уже используется). Это демонстрирует AC3 в связке с `AC1`.

### 1.3 Как добавить негативный тест на удаление вкладки (AC5)
1. В `contracts.test.ts` создай `it('clears tab snapshot after tab removal (AC5)', async () => ...)`.
2. Шаги:
   - `useBackgroundHttpHandlers({ tabId: 77, ... })`.
   - Активируй вкладку POST `/background/tasks-update` (count>0).
   - Сделай `await aggregator.handleTabRemoved(77);` — метод доступен напрямую.
   - GET `/background/state`; ожидание:
     ```ts
     expect(state.tabs['77']).toBeUndefined();
     expect(state.lastTotal).toBe(0);
     ```
3. Это закрывает AC5: состояние очищается после удаления вкладки.

### 1.4 Запуск и валидация
После добавления кейсов прогоняй команду:
```bash
npm run test:contract
```
Если тест падает, Vitest выведет подробный diff. Исправь ожидания и повтори. Если всё ок — переходи к интеграциям.

## 2. Интеграционные тесты: UC-2 и UC-3

Файл: `extension/tests/integration/use-cases.test.ts`. Там уже есть два сценария. Нужно добавить ещё два.

### 2.1 UC-2 «несколько вкладок одновременно»
Цель: показать, что суммарный счётчик задач складывается и debounce уходит, когда обе вкладки свободны.

Шаги:
1. Создай `it('aggregates multiple tabs activity (UC-2)', async () => ...)`.
2. Подними агрегатор (`initializeAggregator`) и два канала `createBackgroundBridge` (например, табы 201 и 202).
3. Для каждого таба запусти `ContentScriptRuntime` и заполни DOM (`document.body.innerHTML = ...`).
4. Используй `advanceTimersByTime` (helper из `support/environment.ts`), чтобы дать runtime время отправить `TASKS_UPDATE`:
   ```ts
   await advanceTimersByTime(20);
   await vi.runOnlyPendingTimersAsync();
   ```
5. Получи snapshot через `aggregator.getSnapshot()` и проверь:
   - есть оба tabId;
   - `lastTotal` равен сумме `count` двух вкладок.
6. Очисти DOM у одного таба (`innerHTML = ''`, `advanceTimersByTime(500)`), убедись, что `lastTotal` пока >0, т.к. второй таб остаётся активным.
7. Очисти и второй таб, после дебаунса (`advanceTimersByTime(12_000)`) ожидай `lastTotal === 0` и `debounce.since === 0`.
8. Не забудь `runtime.destroy()` и `bridge.disconnect()` в конце.

### 2.2 UC-3 «очистка состояния после закрытия вкладки»
Цель: воспроизвести ситуацию закрытия контент-скрипта и убедиться, что агрегатор чистит данные, а alarms не ломаются.

Шаги:
1. Новый тест `it('cleans state and skips heartbeat after tab removal (UC-3)', async () => ...)`.
2. Стартуем агрегатор, bridge и runtime для таба 303. После `runtime.start()` и `advanceTimersByTime`, проверяем, что tab есть в snapshot.
3. Вызови `runtime.destroy()`, затем `chromeMock.__events.tabs.onRemoved.emit(303, { windowId: 1 } as chrome.tabs.TabRemoveInfo);` — это имитирует удаление в реальном браузере.
4. Дополнительно `await aggregator.handleTabRemoved(303);` (бэкенд реагирует на событие).
5. Проверка: snapshot больше не содержит tab, `lastTotal === 0`.
6. Сымитируй срабатывание будильника (`registerAlarms`, `chromeMock.__events.alarms.onAlarm.emit({ name: 'codex-poll' } as chrome.alarms.Alarm);`) и проверь, что `tabs.sendMessage` не вызывается (spy остаётся пустым).
7. Финализируй `bridge.disconnect()` и `alarms.dispose()`.

### 2.3 Прогон интеграций
```bash
npm run test:integration
```
— Vitest должен показать, что все UC проходят. Если таймеры снова выдают нули, попробуй увеличивать `advanceTimersByTime`. Смысл в том, чтобы дать runtime время отправить heartbeat/updates.

## 3. Что делать после успеха
1. Обнови `spec/roadmap.md`, поставив `[x]` в пунктах:
   - Contract tests → финальная строка «Подключить проверки...`
   - Integration tests → строка «Смоделировать UC-1..UC-3...` (после того как UC-2/3 добавлены и проходят).
2. Прогоняй `npm run test:unit` при необходимости (перед переходом к фазе 6 желательно иметь «зелёные» все три команды).
3. Можно записать краткий log в `docs/phase-5-browser-manual.md`, если останутся шаги для ручного теста.

## 4. Troubleshooting и подсказки
- **Vitest «window is not defined»** — значит ты запускаешь что-то в Node окружении. Убедись, что интеграции используют `vitest.integration.config.ts` (там `environment: 'jsdom'`).
- **Spy не вызывается** — поставь `console.log` или временный `await aggregator.getSnapshot()` после таймеров; возможно, нужно больше времени, чем 20 мс (используй 50−100 мс).
- **AJV жалуется** — распечатай `response.json()` и сравни с ожидаемой схемой. Часто забывают `signals` или `ts`.

Когда все чек-листы закрыты, фаза 5 считается завершённой. После этого можно двигаться к фазе 6 (manual QA/packaging) и уже пробовать расширение в браузере.
