# Implementation Plan — Codex Tasks Watcher (v0.1.0)

## Архитектурная структура
```
/extension
  /src
    /content
      detectors/
      index.ts           # точка входа контент-скрипта
      messaging.ts
    /background
      aggregator.ts
      alarms.ts
      notifications.ts
      index.ts           # регистрация listeners
    /popup
      app.ts
      ui/
    /shared
      contracts.ts       # типы, генерируемые из JSON Schema
      storage.ts
  /tests
    unit/
    contract/
    integration/
  manifest.json
```

## Основные шаги реализации
1. **Генерация типов**
   - Использовать `json-schema-to-typescript` или аналог для генерации типов из схем DTO/State.
   - Разместить генерируемые типы в `src/shared/contracts.ts` (авто-генерация через npm script).
2. **Контент-скрипт**
   - Реализовать детекторы D1/D2 (модульная архитектура, возможность подмены).
   - Объединить результаты, вычислять `count`, формировать DTO по схеме.
   - Настроить throttle/ debounce отправки сообщений и реакцию на `PING`.
3. **Background service worker**
   - Модуль `aggregator` обрабатывает `TASKS_UPDATE`, обновляет `AggregatedState` в storage.
   - Модуль `notifications` контролирует антидребезг, создаёт уведомления.
   - Модуль `alarms` управляет `chrome.alarms`, пингует вкладки.
   - Хендлер `tabs.onRemoved` поддерживает консистентность состояния.
4. **Popup**
   - Простое отображение списка вкладок: использование HTMX/VanillaJS + шаблонов.
   - Запрос состояния через messaging (адаптер реализует вызов `/popup/state`).
5. **Инфраструктура**
   - Настроить сборку через `vite` (target: chrome >= 120, manifest v3).
   - Добавить скрипты `npm run build`, `npm run test:unit`, `npm run test:contract`, `npm run test:integration`.
   - Подготовить `manifest.json` с минимальными разрешениями.
6. **Тесты**
   - Unit: jest/vitest с jsdom, мок Chrome API.
   - Contract: `schemathesis` против `contracts/openapi.yaml`.
   - Integration: сквозные сценарии UC-1..UC-4 (использовать fake timers, симулировать сообщения).

## Зависимости и инструменты
- `vite` + `typescript` для сборки.
- `webextension-polyfill` (опционально) для унифицированного API.
- `ajv` для runtime-валидации схем (dev).
- Тесты: `vitest`, `@webext-core/mv3-vite` (опционально), `msw` для HTTP-адаптера.

## Риск-менеджмент
- **Изменение DOM** → конфигурируемые селекторы, unit-тесты на фикстурах.
- **Спящий service worker** → будильник `chrome.alarms`, повторная инициализация состояния.
- **Сложность тестов** → предусмотреть слой-адаптер для Chrome API, чтобы легко мокать.

## Критерии готовности к релизу v0.1.0
- Все Acceptance Criteria из `spec/test-plan.md` выполнены автоматизированными тестами.
- Manifest проходит проверку Chrome Web Store без предупреждений.
- README дополнено инструкцией по сборке и установке unpacked расширения.
