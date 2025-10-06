# Extension Test Suites

Каталоги и файлы синхронизированы с `spec/test-plan.md`:

- `unit/` — модульные тесты Vitest для детекторов, агрегатора, уведомлений, popup и вспомогательных утилит.
- `contract/` — `contracts.test.ts` валидирует JSON Schema, OpenAPI и запускает локальный HTTP-адаптер (`support/http-adapter.ts`).
- `integration/` — сценарии UC-1 / UC-2 из `spec/use-cases.md` (см. `integration/use-cases.test.ts`).
- `support/` — общие хелперы: `background-bridge.ts` (линк между content/runtime и background), `http-adapter.ts`.

Команды запуска тестов находятся в `package.json` (`npm run test:unit`, `npm run test:contract`, `npm run test:integration`).
