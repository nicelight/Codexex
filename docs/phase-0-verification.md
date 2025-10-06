# Фаза 0 — проверка соответствия инфраструктуры спецификациям

Документ фиксирует факт проверки выполненных задач Фазы 0 из `spec/roadmap.md` на соответствие
актуальным спецификациям и брифу (`docs/brief.md`). Проверка выполнена перед переходом к Фазе 1.

## 1. Инициализация репозитория под MV3

| Требование | Источник | Проверка |
|------------|----------|----------|
| Сборка через Vite + TypeScript, наличие пайплайна для MV3 | `spec/implementation-plan.md` (разделы «Архитектурная структура», «Инфраструктура») | `package.json` содержит `vite`, `typescript`, `vitest`, `@types/chrome`, скрипт `dev` запускает `vite build --watch`. |
| Строгий `tsconfig` c alias `src/*` | `spec/implementation-plan.md`, `docs/brief.md` (п. 4, раздел content-script/background) | `tsconfig.json` включает `strict: true`, алиасы `src/*` и `@/*` → `extension/src/*`. |
| Структура каталогов `/extension/src/...` с подмодулями | `spec/implementation-plan.md` | Созданы каталоги `content/`, `background/`, `popup/`, `shared/` и заглушки файлов (`messaging.ts`, `aggregator.ts`, `alarms.ts`, `notifications.ts`, `storage.ts`, `popup/ui`). |
| Тестовые каталоги `extension/tests/{unit,contract,integration}` | `spec/implementation-plan.md`, `spec/test-plan.md` | Каталоги созданы с `.gitkeep` для корректной работы скриптов `test:*`. |
| Конфигурация ESLint/Prettier | `spec/implementation-plan.md` («Инфраструктура») | `eslint.config.js` и `prettier.config.cjs` присутствуют и ориентированы на `extension/src`/`extension/tests`. |

## 2. Manifest & build pipeline

| Требование | Источник | Проверка |
|------------|----------|----------|
| MV3 manifest с минимальными разрешениями (`notifications`, `alarms`, `storage`, `tabs`, `scripting`, `host_permissions`) | `docs/brief.md` (п. 2 «Цели»), `spec/system-capabilities.md` | `extension/manifest.json` содержит перечисленные разрешения и `host_permissions: ["https://*.openai.com/*"]`. |
| Настройка Vite для background, content-script и popup | `spec/implementation-plan.md` | `vite.config.ts` использует плагин `codex-manifest-copy`, задаёт alias и `test.environment = jsdom` по требованиям тест-плана. |
| Скрипты `build`, `dev`, `lint`, `test:unit`, `test:contract`, `test:integration` | `spec/roadmap.md`, `spec/implementation-plan.md`, `spec/test-plan.md` | `package.json` содержит все требуемые npm-скрипты, направляющие Vitest на ожидаемые каталоги. |
| Заготовка модулей, упомянутых в спецификациях | `docs/brief.md`, `spec/system-capabilities.md`, `spec/test-plan.md` | Файлы-заглушки подключаются в `background/index.ts` и `content/messaging.ts`, поддерживая согласованность с контрактами (`contracts/*`). |

## 3. Вывод

Все подпункты Фазы 0, отмеченные выполненными в `spec/roadmap.md`, подтверждены проверкой
на соответствие брифу и спецификациям. Дополнительных расхождений, требующих пересмотра
спецификаций или инфраструктуры, не обнаружено.
