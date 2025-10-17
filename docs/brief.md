# Codex Tasks Watcher — brief.md

> **Цель:** разработать расширение Chrome (Manifest V3), которое **отслеживает активные задачи в Codex** (интерфейс ChatGPT Codex) методом наблюдения за DOM (вариант B) и **выдаёт ненавязчивое уведомление**, когда **во всех открытых вкладках Codex** задачи завершены. Бриф ориентирован на Spec‑Driven Development (SDD): сначала контракты, затем реализация.

---

## 1. Контекст и обоснование

* Пользователь запускает длительные задачи в Codex (скринкасты в задаче: крутящийся индикатор в карточке и кнопка Stop в списке задач).
* Сейчас статус нужно проверять вручную, отвлекаясь от работы.
* Расширение должно **само заметить окончание** всех активных задач и **показать одно короткое уведомление**.

**Архитектурное ограничение:** нет публичного API. Используем **DOM‑детекторы** + необязательный перехват `fetch` (без вмешательства, только чтение факта наличия обращений) — гибрид возможен, но MVP = DOM.

---

## 2. Цели и нефункциональные приоритеты

**Цели**

1. Точно понимать, есть ли хотя бы одна запущенная задача во всех открытых вкладках Codex.
2. Показывать системное уведомление «Все задачи в Codex завершены», когда счётчик активных задач падает с >0 до 0 (с антидребезгом).
3. Минимум прав: `storage`, `notifications`, `alarms`, `scripting`, `tabs` и `host_permissions` для доменов Codex/ChatGPT (`tabs` требуется background для опроса и очистки вкладок).
4. Приватность: **никаких внешних отправок** данных; только локальное хранение состояния в `chrome.storage.session`.

**Нефункциональные требования (NFR)**

* Работает при неактивной вкладке Codex; корректно переживает «сон» service worker’а (MV3).
* Не вызывает заметной нагрузки (<2% CPU на вкладку в простое, не более 1 DOM‑сканирования в секунду при бурных мутациях благодаря троттлингу `snapshot()` через `requestIdleCallback`/таймер).
* Интернациональность: работает на RU/EN UI.
* Устойчивость к редизайну: несколько независимых детекторов; простое обновление сигнатур.
* Фоновые скрипты применяют настройку `autoDiscardableOff` ко всем вкладкам Codex не позднее нескольких секунд после изменения (проверяется по состоянию `chrome://discards`).

**Принцип простоты:** основной приоритет проекта — сохранять максимально простую архитектуру даже ценой функциональности или устойчивости. Любое усложнение (новые пайплайны, дополнительные слои абстракций, тяжёлые зависимости) допускается только после согласования с заказчиком.

**Не‑цели**

* Не показываем историю, графики, не управляем задачами.
* Не обходим логины, не работаем без открытой вкладки Codex.

---

## 3. Персоны и сценарии

**Персона**: разработчик/автор задач в Codex. Открывает одну или несколько вкладок Codex; хочет уведомление «когда всё отработало».

**Ключевые юзкейсы**

1. *Один проект, одна вкладка.* Пользователь запускает задачу → сворачивает вкладку → получает уведомление по завершении.
2. *Несколько вкладок/проектов.* В разных вкладках идут разные задачи. Уведомление только когда **во всех** вкладках нет активных задач.
3. *Мигания/краткие спиннеры.* Короткие вспышки прогресса не должны вызывать ложных срабатываний — уведомляем c задержкой 10–15 с.

---

## 4. Обзор решения (высокоуровнево)

* **content‑script** (на страницах `https://*.openai.com/*` и `https://*.chatgpt.com/*`):

  * Ставит `MutationObserver` на `document.documentElement` и планирует сканирование через `requestIdleCallback` (fallback — таймер) с троттлингом ≥1 скан/сек.
  * Периодически/при мутациях вызывает простой `ActivityScanner`, который напрямую проходит по DOM без конвейера детекторов и собирает эвристики:

    * D1: глобальные индикаторы «крутилка» (`[aria-busy="true"]`, `role="progressbar"`, `.animate-spin`, SVG с `animateTransform`).
    * D2: кнопки **Stop/Cancel/Остановить/Отменить** (`button`, `[role="button"]`, `a[href]` с подходящими подписями и атрибутами).
    * D4: числовой счётчик активных задач (`div.absolute.inset-0.flex.items-center.justify-center`).
    * **D3 (v0.2.0+)**: эвристика карточек остаётся зарезервированной и будет добавлена только после отдельного согласования.
  * Для предотвращения ложных нулевых срабатываний использует локальный debounce 500 мс перед отправкой `count=0`.
  * Поддерживает таймер heartbeat (каждые 15 секунд или при пробуждении после `PING`), отправляя сообщение `TASKS_HEARTBEAT` с отметкой времени последнего успешного сканирования, чтобы background понимал, что вкладка «живая», даже если активных задач нет.
  * Шлёт сообщение в **background** с текущим состоянием вкладки и обрабатывает события `PING`/`RESET`/`REQUEST_STATE` от сервиса.

* **background (service worker)**:

  * Агрегирует состояния всех вкладок в `chrome.storage.session['codex.tasks.state']`, восстанавливая их при перезапуске и валидируя по JSON Schema.
* Считает `totalActiveCount` (сумма активных по всем вкладкам) и поддерживает антидребезг (`debounce.since`), беря длительность окна из `chrome.storage.sync.debounceMs` через контроллер настроек (значение нормализуется к диапазону 0–60000 мс и применяется на лету при изменении).
  * Если предыдущее значение `> 0`, новое `= 0` и выдержан антидребезг → `chrome.notifications.create(...)` с локализованными строками (RU/EN) и последующим сбросом окна.
  * Таймер `chrome.alarms` (каждую минуту) вызывает `aggregator.evaluateHeartbeatStatuses()`: при устаревших heartbeat помечает вкладки как `STALE` и отправляет `PING` через `chrome.tabs.sendMessage`.
* Следит за жизненным циклом вкладок: `tabs.onRemoved` очищает состояние, а при любых изменениях агрегированного состояния применяет `chrome.tabs.update({ autoDiscardable: autoDiscardableOff ? false : true })` ко всем отслеживаемым вкладкам, где `autoDiscardableOff` — актуальное значение из `chrome.storage.sync`; переключение настройки мгновенно включает или отключает защиту от авто‑выгрузки.
  * Управляет уровнем логирования через флаг `chrome.storage.session['codex.tasks.verbose']` (обновляется при изменении storage).
* Контроллер настроек синхронизирует `debounceMs`, `autoDiscardableOff`, `sound`, `soundVolume` и `showBadgeCount` из `chrome.storage.sync`; агрегатор, уведомления, аудио‑контроллер и индикатор действия реагируют на изменения без перезагрузки (UI для редактирования значений планируется отдельно).

* **popup**:

  * По сообщению `POPUP_GET_STATE` получает снимок `PopupRenderState`, сортирует вкладки по количеству активных задач и времени последней активности, отображает счётчик и локализованные подписи (RU/EN).
  * Для каждой вкладки показывает последний список сигналов как есть (без группировки по `taskKey`), подчёркивает статус `STALE` и выводит человекочитаемое время последнего контакта.
  * В состоянии без задач отображает локализованное сообщение «Нет активных задач».

---

## 5. Контракты и схемы (contract‑first)

### 5.1. Сообщение от content‑script к background

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "codex.tasks/dto/content-update.json",
  "type": "object",
  "required": ["type", "origin", "active", "count", "signals", "ts"],
  "properties": {
    "type": {"const": "TASKS_UPDATE"},
    "origin": {"type": "string", "format": "uri"},
    "active": {"type": "boolean"},
    "count": {
      "type": "integer",
      "minimum": 0,
      "description": "Агрегированное количество активных задач на вкладке: максимум между числом уникальных задач, найденных детекторами, и числовыми счётчиками спиннеров"
    },
    "signals": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["detector", "evidence"],
        "properties": {
          "detector": {"type": "string", "enum": ["D1_SPINNER","D2_STOP_BUTTON","D3_CARD_HEUR","D4_TASK_COUNTER" ]},
          "evidence": {"type": "string"},
          "taskKey": {
            "type": "string",
            "description": "Стабильный идентификатор задачи; передаётся детекторами, способными выделить конкретную карточку"
          }
        }
      }
    },
    "ts": {"type": "number", "description": "epoch ms"}
  }
}
```

> **Примечание:** идентификатор вкладки background получает из `sender.tab.id`, поэтому поле `tabId` в сообщении не требуется. Контент‑скрипт не вычисляет `tabId`, а разрешение `tabs` используется только на стороне background для пингов и очистки состояния вкладок (см. §§2/8/10). Значение `D4_TASK_COUNTER` соответствует числовому индикатору на странице задачи, а `D3_CARD_HEUR` остаётся зарезервированным для будущего релиза. Поле `taskKey` заполняется только детекторами, которые могут привязать сигнал к конкретной карточке задачи (D2, в будущем D3); для спиннеров и счётчика оно опускается.

Отдельное сообщение `TASKS_HEARTBEAT` (см. `contracts/dto/content-heartbeat.schema.json`) содержит `{ origin, ts, lastUpdateTs, intervalMs, respondingToPing? }` и используется для актуализации `lastSeenAt` и статуса вкладки. Контент-скрипт отправляет heartbeat каждые ≤15 секунд и сразу после `PING`, чтобы background мог отличить «живую» вкладку от замороженной.

### 5.2. Хранимое агрегированное состояние у background

Объект `state`, записываемый в `chrome.storage.session`, всегда содержит три верхнеуровневых поля: `tabs`, `lastTotal`, `debounce`.
Все чтения/записи выполняются относительно `DEFAULT_STATE`: при чтении фон берет сохранённый слепок и поверх накладывает значения
по умолчанию, а при записи обновляет **единый объект** (`state`) так, чтобы `tabs`, `lastTotal` и `debounce` находились в нём и были
согласованы между собой.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "codex.tasks/state/session.json",
  "type": "object",
  "properties": {
    "tabs": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["origin","title","active","count","updatedAt"],
        "properties": {
          "origin": {"type": "string"},
          "title": {"type": "string", "description": "Название вкладки, берётся из sender.tab.title, при отсутствии заменяется на origin"},
          "active": {"type": "boolean"},
          "count": {"type": "integer"},
          "updatedAt": {"type": "number"},
          "signals": {
            "type": "array",
            "description": "Последний снимок сигналов от вкладки; используется popup для отображения карточек",
            "items": {
              "type": "object",
              "required": ["detector", "evidence"],
              "properties": {
                "detector": {"type": "string"},
                "evidence": {"type": "string"},
                "taskKey": {"type": "string"}
              }
            }
          }
        }
      }
    },
    "lastTotal": {"type": "integer"},
    "debounce": {"type": "object", "properties": {"ms": {"type":"integer","minimum":0}, "since": {"type":"number"}}}
  }
}
```

Background хранит `signals` в виде последнего снимка сообщений: каждый объект содержит `detector`, `evidence` и (если был передан) `taskKey`. Popup отображает список сигналов в полученном порядке; ответственное за дедупликацию поведение остаётся на детекторах и агрегаторе (проверка равенства сигналов по тройке `detector/evidence/taskKey`).

Дополнительно каждая вкладка хранит `lastSeenAt` (максимум между `updatedAt` и временем последнего `TASKS_HEARTBEAT`) и объект `heartbeat { lastReceivedAt, expectedIntervalMs, status, missedCount }`. Если heartbeat не приходит более чем `expectedIntervalMs * 3` (≈45 секунд), background помечает вкладку как `STALE`, инициирует повторный `PING` и не учитывает устаревшие данные при расчёте уведомлений.
При первом `TASKS_UPDATE` для вкладки background создаёт heartbeat с `expectedIntervalMs = 15000`, `status = OK`, `missedCount = 0`, устанавливая `lastSeenAt` и `heartbeat.lastReceivedAt` по переданному `ts`.

### 5.3. Настройки пользователя (UI → storage.sync)

> **Статус:** фоновые сервисы уже читают и применяют настройки из `chrome.storage.sync`; UI для редактирования остаётся в бэклоге (можно задавать значения через DevTools/Sync API вручную).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "codex.tasks/settings.json",
  "type": "object",
  "properties": {
    "debounceMs": {"type": "integer", "default": 12000, "minimum": 0, "maximum": 60000},
    "sound": {"type": "boolean", "default": false},
    "autoDiscardableOff": {"type": "boolean", "default": true},
    "showBadgeCount": {"type": "boolean", "default": true}
  }
}
```

`autoDiscardableOff = true` трактуется как запрет на авто‑выгрузку вкладок Codex: background применяет `chrome.tabs.update({ autoDiscardable: false })` ко всем отслеживаемым вкладкам при каждом изменении агрегированного состояния. При выключении настройки (`autoDiscardableOff = false`) фон возвращает стандартное поведение браузера и вызывает `chrome.tabs.update({ autoDiscardable: true })` для затронутых вкладок.

---

## 6. Обнаружение активности

Контент-скрипт больше не строит конвейер детекторов. `ActivityScanner` напрямую проходит по DOM и собирает сигналы тремя грубыми эвристиками.

**D1 — Спиннер**

* Использует набор селекторов `[aria-busy="true"]`, `[role="progressbar"]`, `.animate-spin`, `.loading-spinner`, `svg[role="img"] animateTransform`.
* Первые пять найденных элементов превращаются в сигналы `D1_SPINNER` (см. `elementEvidence` для построения `evidence`).
* `count` равен количеству сигналов (минимум 1, максимум 5) — если найден хотя бы один спиннер, вкладка считается активной.

**D2 — Кнопка Stop/Cancel/Остановить/Отменить**

* Просматривает `button`, `[role="button"]`, `a[href]`.
* Игнорирует скрытые (`hidden`, `aria-hidden`, `display:none`, `visibility:hidden`, `opacity:0`) и отключённые (`disabled`, `aria-disabled=true`) элементы.
* Ищет ключевые слова в тексте, `title`, `aria-label`, `data-testid`; поддерживаются RU/EN строки, а также любые варианты со словами `stop`/`cancel`.
* `taskKey` считывается из ближайших `data-task-id`/`data-id`/`data-reactid`.
* `count` равен числу найденных кнопок.

**D4 — Счётчик задач**

* Ищет блоки `div.absolute.inset-0.flex.items-center.justify-center`.
* Из текста извлекается максимальное целое число; если оно >0, формируется одиночный сигнал `D4_TASK_COUNTER`.

**Нормализация задач и расчёт `count`**

* Контент-скрипт возвращает единый список сигналов (`detector`, `evidence`, `taskKey?`).
* `ActivityScanner` вычисляет `count` как максимум из `signals.length` для D2, количества спиннеров (но не меньше 1, если найдено) и максимального числового значения из счётчиков.
* `taskKey` присутствует только у сигналов, где эвристика смогла его вычислить (пока это кнопки остановки).

**Политика решения:** активной считаем вкладку, если сработала хотя бы одна из эвристик.

---

## 7. UX и поведение

* **Popup (MVP v0.1.0)**: отображает заголовок с суммарным счётчиком, временную метку генерации `generatedAt` и отсортированный список вкладок. Каждая карточка показывает `title`, человекочитаемый `origin`, счётчик задач и локализованный текст «Последняя активность». Если вкладка помечена как `STALE`, добавляется предупреждение. Сигналы выводятся списком без группировки.
* **Системное уведомление (MVP v0.1.0)**: один раз при переходе `>0 → 0`, текст: `Все задачи Codex завершены` / `All Codex tasks are complete`; кнопка `ОК` обязательна. После отправки уведомления debounce сбрасывается.
* **Иконка расширения (v0.2.0+)**: бейдж с точным числом активных задач (суммарно по вкладке); при `count = 0` бейдж очищается. В MVP бейдж скрыт.
* **Звук уведомления (v0.2.0+)**: при включенной настройке `sound` проигрывается короткий клип (через offscreen document); в MVP звука нет.
* **Детекторы**: фильтруют скрытые элементы (шаблонные спиннеры, `aria-hidden` контейнеры) до расчёта состояния, чтобы исключить ложные уведомления.

**Локализация:** RU/EN строки в словаре; язык по `navigator.language`.

**Доступность (a11y):** роли/aria‑label для списка в popup, фокус на кнопку «ОК» в уведомлении.

---

## 8. Разрешения и политика безопасности

* `host_permissions`: `https://*.openai.com/*`, `https://*.chatgpt.com/*` (уточнить производные домены Codex при интеграции).
* `permissions`: `storage`, `notifications`, `alarms`, `scripting`, `tabs` (нужно background для пингов вкладок и работы с `autoDiscardable`).
* CSP: не вставляем инлайновые скрипты в страницу; работаем в изолированном мире контент‑скрипта.

**Приватность:** никакой сети; все данные локально; можно включить «Diagnostic log» (в `storage.session`) для отладки, off by default.

---

## 9. Структура проекта

```
/extension
  manifest.json
  /src
    bg.js               # background service worker
    content.js          # DOM‑детекторы + отправка статуса
    popup.html
    popup.js
    i18n.js
    sound/complete.mp3  # опционально, добавляется с v0.2.0+
  /assets
    icon16.png icon48.png icon128.png
  /contracts
    content-update.schema.json
    session-state.schema.json
    settings.schema.json
```

---

## 10. Логика антидребезга и учёт вкладок

* Background хранит `state` с полями `tabs`, `lastTotal` и `debounce` в `chrome.storage.session['codex.tasks.state']`; `debounce.since` фиксирует момент перехода в потенциально пустое состояние.
* При запуске агрегатор читает снимок из `storage.session`; если данных нет или они не проходят схему, записывает `DEFAULT_STATE` и уведомляет слушателей, чтобы остальные модули получили согласованное начальное состояние.
* При каждом `TASKS_UPDATE` агрегатор пересчитывает `lastTotal` как сумму `tab.count`. Если сумма падает с `>0` до `0`, устанавливается `debounce.since`; при появлении задач окно сбрасывается.
* Контроллер настроек загружает `debounceMs`, `autoDiscardableOff`, `sound`, `soundVolume` и `showBadgeCount` из `chrome.storage.sync`, нормализует значения и передаёт их фоновым сервисам (агрегатор, `alarms`, аудио, action indicator). Изменения в `storage.sync` применяются без перезапуска; при ошибках/пустом состоянии используются `SETTINGS_DEFAULTS`.
* Модуль `notifications` подписывается на `aggregator.onIdleSettled` и получает готовый снимок состояния, когда окно антидребезга завершено. После проверки на отсутствие активных задач формирует уведомление.
* Контроллер `alarms` поддерживает `autoDiscardable`: при каждом изменении `AggregatedState` и при старте выполняет `chrome.tabs.update(tabId, { autoDiscardable: false })` для известных вкладок, удаляя ID при `tab-removed`.
* Таймер `chrome.alarms` (`codex-poll`, 1 минута) вызывает `aggregator.evaluateHeartbeatStatuses()`, помечает вкладки как `STALE` и отправляет `PING` через `chrome.tabs.sendMessage` только тем tabId, которые давно не отправляли heartbeat.
* Логика сканирования основана на `MutationObserver` с `childList`, `subtree` и `characterData`: любые изменения структуры или текста карточек перезапускают скан с троттлингом ≥1 раз в секунду.
* Состояние вкладки очищается обработчиком `chrome.tabs.onRemoved`: агрегатор удаляет запись, пересчитывает `lastTotal`, при обнулении сбрасывает `debounce.since` и сохраняет обновлённый объект.

---

## 11. Краевые случаи

* Вкладку выгрузили из памяти (tab discard): при следующем открытии контент‑скрипт заново пришлёт статус.
* Codex перестаёт опрашивать сервер в фоне: уведомление может появиться только после следующего видимого изменения DOM. Митигируем минутным `PING` + пересчёт.
* Редизайн Codex ломает селекторы: резервные детекторы + фичефлаги; быстрое обновление через Web Store.

---

## 12. Тест‑план (ручной)

### MVP v0.1.0

1. Одна вкладка, одна задача → дождаться завершения → одно уведомление; убедиться, что текст «Все задачи в Codex завершены» и кнопка «ОК» отображаются; в popup карточка задачи отображает название вкладки (по `title`).
2. Несколько вкладок (2–3), задачи заканчиваются в разное время → уведомление только когда все завершились.
2a. Проверить, что `state.tabs[tabId].signals` сохраняет последнюю выборку: для кнопок Stop присутствует `taskKey`, спиннеры перечислены отдельными записями, а popup отображает эти сигналы в том же порядке без дополнительной группировки.
3. Краткий всплеск спиннера (перезапуск) → уведомление **не** показывается (антидребезг).
4. Неактивная вкладка (свернута) → уведомление приходит.
5. Вкладку закрыли во время выполнения → не считать её активной после закрытия.
6. Проверить обработчик `tabs.onRemoved`: закрыть вкладку, убедиться по popup/логу, что запись о вкладке удалена и антидребезг сброшен.
7. RU/EN локали → корректные тексты.
8. Принудительно «усыпить» вкладку → дождаться `PING` и убедиться, что content‑script выполняет повторное сканирование (через `scanNow('ping')`), отправляет `TASKS_UPDATE`/`TASKS_HEARTBEAT`, а статус вкладки в popup возвращается к `OK`.
9. Сценарий бурных мутаций: запустить скрипт, быстро меняющий DOM, и по логам/таймстемпам сообщений убедиться, что `snapshot()` вызывается не чаще 1 раза в секунду.
10. Глобальный спиннер с числовым индикатором (например, «3») при отсутствии карточек → popup и агрегированное состояние показывают 3; в сообщении `TASKS_UPDATE` поле `count` равно 3.

### Отложено (v0.2.0+)

11. (v0.2.0+, D3) Одна задача одновременно детектируется D2 и D3 → в popup и агрегированном состоянии остаётся 1 (дедупликация по `taskKey`).
12. (v0.2.0+) Опция `sound` → звук присутствует/отсутствует в зависимости от настройки.
13. (v0.2.0+) Включение/выключение `showBadgeCount` → бейдж появляется/очищается корректно, значения совпадают с `count`.
14. (v0.2.0+) Изменение `autoDiscardableOff` и `debounceMs` через UI → настройки синхронизируются и применяются ко всем вкладкам.

---

## 13. Критерии приёмки (AC)

* AC‑1 (MVP v0.1.0): При наличии хотя бы одной активной задачи в любой вкладке popup и агрегированное состояние отражают ненулевой `count` и не сбрасываются до завершения всех задач; popup отображает сигналы из `state.tabs[tabId].signals` в последнем известном порядке.
* AC‑1b (v0.2.0+): Иконка показывает ненулевой бейдж с точным числом активных задач при включённой опции; при отключении опции бейдж скрывается.
* AC‑2 (MVP v0.1.0): Уведомление «Все задачи в Codex завершены» с кнопкой «ОК» показывается **ровно один раз** при переходе `>0 → 0` с задержкой по настройке.
* AC‑2b (v0.2.0+): Пользователь может включить/отключить звук уведомления; поведение расширения соответствует выбранной настройке.
* AC‑2c (v0.2.0+): Изменение настроек `debounceMs` и `autoDiscardableOff` через UI отражается в поведении background во всех открытых вкладках.
* AC‑3: Расширение не инициирует сетевые запросы за пределы домена браузера и не отправляет пользовательские данные наружу.
* AC‑4: Работает на неактивных вкладках; после принудительного сна background восстанавливает агрегированное состояние в течение 60 секунд.
* AC‑5: Минимальные permissions; установка проходит без ошибок; в popup виден список активных задач с названием каждой вкладки (по `state.tabs[tabId].title`) или сообщение об их отсутствии.
* AC‑6: Детекторы не дают ложных срабатываний на скрытые индикаторы (спиннеры/кнопки внутри `aria-hidden`, `display:none`, `visibility:hidden|collapse`, `opacity:0`).

---

## 14. План релиза

* **MVP v0.1.0**: DOM‑детекторы D1/D2, агрегатор, уведомление, popup, RU/EN (**без** бейджа, пользовательских настроек, звукового оповещения и эвристики D3).
* **v0.2.0**: бейдж на иконке, UI/синхронизация настроек (`debounceMs`, `sound`, `autoDiscardableOff`, `showBadgeCount`), звуковое оповещение, фичефлаги детекторов и подключение эвристики D3.
* **v0.3.0**: необязательный перехват `fetch` (read‑only) для повышения точности.

---

## 15. Риски и их смягчение (простым языком)

* **Редизайн сайта**: селекторы могут перестать подходить → держим несколько способов распознавания и быстро обновляем расширение.
* **Сон вкладок/фона**: Chrome экономит ресурсы → пингуем вкладки и используем события мутаций вместо таймеров.
* **Ложные срабатывания**: спиннер моргнул → антидребезг и учёт перехода именно с `>0` на `0`.

---

## 16. Открытые вопросы

* Точные домены/пути Codex для `host_permissions` (уточнить в среде пользователя).
* Доступность `aria`‑атрибутов на текущей версии интерфейса (проверить на реальной странице).
* Нужен ли отдельный режим «только моя организация/рабочий аккаунт»?

---

## 17. Приложение: пример manifest.json (MV3)

```json
{
  "manifest_version": 3,
  "name": "Codex Tasks Watcher",
  "version": "0.1.1",
  "permissions": ["storage", "notifications", "alarms", "scripting", "tabs"],
  "host_permissions": ["https://*.openai.com/*", "https://*.chatgpt.com/*"],
  "background": { "service_worker": "src/bg.js" },
  "content_scripts": [
    {
      "matches": ["https://*.openai.com/*", "https://*.chatgpt.com/*"],
      "js": ["src/content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": { "default_popup": "src/popup.html" },
  "icons": {"16":"assets/icon16.png","48":"assets/icon48.png","128":"assets/icon128.png"}
}
```

---

## 18. Приложение: минимальная логика content.js (псевдокод)

```js
const isVisible = (node) => {
  if (!node) return false;
  if (node.closest('[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(node);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  if (parseFloat(style.opacity) === 0) return false;
  if (!node.offsetParent && style.position !== 'fixed') return false;
  return true;
};

const collectVisible = (selector, matcher = () => true) =>
  Array.from(document.querySelectorAll(selector)).filter((el) => isVisible(el) && matcher(el));

const describeNode = (node) => {
  const tag = node?.tagName?.toLowerCase() ?? 'unknown';
  const id = node?.id ? `#${node.id}` : '';
  const cls = node?.classList?.value ? `.${node.classList.value.split(/\s+/).filter(Boolean).join('.')}` : '';
  return `${tag}${id}${cls}`;
};

const TASK_CARD_SELECTOR = '[data-testid*="task" i]';

const resolveTaskKey = (node) => {
  if (!node) return null;
  const card = node.closest?.(TASK_CARD_SELECTOR);
  if (card) {
    return card.getAttribute('data-task-id') || card.getAttribute('data-testid') || describeNode(card);
  }
  const labelled = node.getAttribute?.('aria-labelledby');
  if (labelled) return labelled;
  return describeNode(node);
};

const extractSpinnerHint = (node) => {
  const text = node?.textContent?.trim() ?? '';
  const match = text.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
};

const detectors = {
  D1_SPINNER: () =>
    collectVisible('[aria-busy="true"], [role="progressbar"], .animate-spin, svg[aria-label*="loading" i]').map((node) => ({
      node,
      taskKey: null,
      countHint: extractSpinnerHint(node)
    })),
  D2_STOP_BUTTON: () =>
    collectVisible('button', (btn) => {
      const aria = btn.getAttribute('aria-label') || '';
      const text = btn.textContent || '';
      return /stop|остановить/i.test(aria + ' ' + text);
    }).map((btn) => ({
      node: btn,
      taskKey: resolveTaskKey(btn)
    })),
  // v0.2.0+: включить D3_CARD_HEUR (эвристика карточек)
  D3_CARD_HEUR: () => []
};

const SNAPSHOT_MIN_INTERVAL = 1000; // 1 scan/sec максимум
let lastSnapshotAt = 0;
let pendingSnapshot = false;
let idleHandle = null;
let fallbackTimer = null;

function snapshot(){
  let spinnerHint = 0;
  let spinnerPresence = 0;
  const taskKeys = new Set();
  const seenSignals = new Set();
  const signals = [];

  Object.entries(detectors).forEach(([detector, fn]) => {
    let matches = [];
    try {
      matches = fn();
    } catch {
      matches = [];
    }

    matches.forEach(({ node, taskKey, countHint }) => {
      if (taskKey) {
        taskKeys.add(taskKey);
      }
      if (detector === 'D1_SPINNER') {
        spinnerPresence += 1;
        if (Number.isFinite(countHint)) {
          spinnerHint = Math.max(spinnerHint, countHint);
        }
      }

      const evidence = taskKey || describeNode(node);
      const signature = `${detector}::${taskKey ?? evidence}`;
      if (seenSignals.has(signature)) return;
      seenSignals.add(signature);

      const signal = { detector, evidence };
      if (taskKey) {
        signal.taskKey = taskKey;
      }
      signals.push(signal);
    });
  });

  const uniqueTasks = taskKeys.size;
  const count = Math.max(uniqueTasks, spinnerHint, spinnerPresence > 0 ? 1 : 0);
  const active = count > 0 || signals.length > 0;

  chrome.runtime.sendMessage({ type:'TASKS_UPDATE', origin: location.origin, active, count, signals, ts: Date.now() });
}

const runScheduledSnapshot = () => {
  pendingSnapshot = false;
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  if (idleHandle && 'cancelIdleCallback' in window) {
    cancelIdleCallback(idleHandle);
    idleHandle = null;
  }

  const now = performance.now();
  const elapsed = now - lastSnapshotAt;
  if (elapsed < SNAPSHOT_MIN_INTERVAL) {
    pendingSnapshot = true;
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = null;
      runScheduledSnapshot();
    }, SNAPSHOT_MIN_INTERVAL - elapsed);
    return;
  }

  lastSnapshotAt = now;
  snapshot();
};

function requestSnapshot() {
  if (pendingSnapshot) return;
  pendingSnapshot = true;

  const launch = () => {
    idleHandle = null;
    runScheduledSnapshot();
  };

  if ('requestIdleCallback' in window) {
    idleHandle = requestIdleCallback(launch, { timeout: SNAPSHOT_MIN_INTERVAL });
  } else {
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = null;
      launch();
    }, 0);
  }
}

const mo = new MutationObserver(() => requestSnapshot());
mo.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
  characterDataOldValue: true // фиксируем текстовые изменения для D2 (и будущего D3)
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'PING') requestSnapshot();
});

requestSnapshot();
```

---

## 19. Приложение: минимальная логика bg.js (псевдокод)

```js
const DEFAULT_STATE = {
  tabs: {},
  lastTotal: 0,
  debounce: { ms: 12000, since: 0 }
};

const DEFAULT_SETTINGS = {
  debounceMs: 12000,
  autoDiscardableOff: true,
  sound: false,
  soundVolume: 0.5,
  showBadgeCount: true
};

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000;

let state = { ...DEFAULT_STATE };
let settings = { ...DEFAULT_SETTINGS };

async function ensureStateSnapshot() {
  try {
    const { state: stored } = await chrome.storage.session.get(['state']);
    if (stored) {
      state = {
        ...DEFAULT_STATE,
        ...stored,
        tabs: { ...DEFAULT_STATE.tabs, ...stored.tabs },
        debounce: { ...DEFAULT_STATE.debounce, ...stored.debounce }
      };
      state.lastTotal = Object.values(state.tabs).reduce((acc, tab) => acc + (tab.count || 0), 0);
      return;
    }
  } catch (error) {
    console.warn('failed to read session state', error);
  }
  state = { ...DEFAULT_STATE };
  await chrome.storage.session.set({ state });
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function applySettingsPatch(patch = {}) {
  settings = {
    ...settings,
    ...patch,
  };
  settings.debounceMs = clamp(settings.debounceMs ?? DEFAULT_SETTINGS.debounceMs, 0, 60_000);
  settings.autoDiscardableOff = Boolean(settings.autoDiscardableOff);
  settings.sound = Boolean(settings.sound);
  settings.soundVolume = clamp(settings.soundVolume ?? DEFAULT_SETTINGS.soundVolume, 0, 1);
  settings.showBadgeCount = Boolean(settings.showBadgeCount);
}

async function refreshSettings() {
  try {
    const stored = await chrome.storage.sync.get([
      'debounceMs',
      'autoDiscardableOff',
      'sound',
      'soundVolume',
      'showBadgeCount',
    ]);
    applySettingsPatch(stored);
  } catch (error) {
    console.warn('failed to load sync settings', error);
    settings = { ...DEFAULT_SETTINGS };
  }
  applyAutoDiscardableToAllCodexTabs();
}

function applyAutoDiscardable(tabId) {
  if (typeof tabId !== 'number') return;
  chrome.tabs.update(tabId, { autoDiscardable: settings.autoDiscardableOff ? false : true });
}

function applyAutoDiscardableToAllCodexTabs() {
  chrome.tabs.query({ url: ['*://*.openai.com/*', '*://*.chatgpt.com/*'] }, (tabs) => {
    tabs.forEach((tab) => applyAutoDiscardable(tab.id));
  });
}

(async function bootstrap() {
  await ensureStateSnapshot();
  await refreshSettings();
})();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  const patch = {};
  if (typeof changes.debounceMs?.newValue === 'number') {
    patch.debounceMs = changes.debounceMs.newValue;
  }
  if (typeof changes.autoDiscardableOff?.newValue === 'boolean') {
    patch.autoDiscardableOff = changes.autoDiscardableOff.newValue;
  }
  if (typeof changes.sound?.newValue === 'boolean') {
    patch.sound = changes.sound.newValue;
  }
  if (typeof changes.soundVolume?.newValue === 'number') {
    patch.soundVolume = changes.soundVolume.newValue;
  }
  if (typeof changes.showBadgeCount?.newValue === 'boolean') {
    patch.showBadgeCount = changes.showBadgeCount.newValue;
  }
  if (Object.keys(patch).length === 0) {
    return;
  }
  applySettingsPatch(patch);
  if ('autoDiscardableOff' in patch) {
    applyAutoDiscardableToAllCodexTabs();
  }
});

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type !== 'TASKS_UPDATE') return;
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') return;

  await ensureStateSnapshot();
  applyAutoDiscardable(tabId);

  const prevTabs = state.tabs;
  const nextState = {
    ...state,
    tabs: { ...prevTabs },
    debounce: { ...state.debounce, ms: settings.debounceMs }
  };

  const guaranteedCount = msg.count;
  const inferredActive = guaranteedCount > 0 ? true : msg.active;
  const now = Date.now();
  const snapshotTs = msg.ts;
  const prevTab = prevTabs[tabId];
  const heartbeat = prevTab?.heartbeat
    ? { ...prevTab.heartbeat }
    : {
        lastReceivedAt: snapshotTs,
        expectedIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
        status: 'OK',
        missedCount: 0,
      };
  const lastSeenAt = Math.max(snapshotTs, prevTab?.lastSeenAt ?? 0, heartbeat.lastReceivedAt ?? 0);

  nextState.tabs[tabId] = {
    origin: msg.origin,
    title: sender.tab?.title?.trim() || msg.origin,
    active: inferredActive,
    count: guaranteedCount,
    updatedAt: now,
    lastSeenAt,
    heartbeat,
    signals: (msg.signals || []).map(({ detector, evidence, taskKey }) => ({
      detector,
      evidence,
      ...(taskKey ? { taskKey } : {}),
    })),
  };

  const previousTotal = state.lastTotal;
  const total = Object.values(nextState.tabs).reduce((acc, tab) => acc + (tab.count || 0), 0);
  nextState.lastTotal = total;

  if (previousTotal > 0 && total === 0) {
    nextState.debounce.since = Date.now();
    setTimeout(async () => {
      await ensureStateSnapshot();
      const stillZero = state.lastTotal === 0 && Object.values(state.tabs).every((t) => (t.count || 0) === 0);
      const debounceElapsed =
        state.debounce.since > 0 && Date.now() - state.debounce.since >= state.debounce.ms;
      if (stillZero && debounceElapsed) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icon128.png',
          title: 'Codex',
          message: 'Все задачи в Codex завершены',
          buttons: [{ title: 'ОК' }],
        });
        // при включенном settings.sound → offscreen document воспроизводит звук
        state.debounce.since = 0;
        await chrome.storage.session.set({ state });
      }
    }, nextState.debounce.ms);
  }

  state = nextState;
  await chrome.storage.session.set({ state: nextState });
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ensureStateSnapshot();
  delete state.tabs[tabId];
  state.lastTotal = Object.values(state.tabs).reduce((acc, tab) => acc + (tab.count || 0), 0);
  if (state.lastTotal === 0) {
    state.debounce.since = 0;
  }
  await chrome.storage.session.set({ state });
});

chrome.alarms.create('codex-poll', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'codex-poll') return;
  chrome.tabs.query({ url: ['*://*.openai.com/*', '*://*.chatgpt.com/*'] }, (tabs) => {
    tabs.forEach((tab) => chrome.tabs.sendMessage(tab.id, { type: 'PING' }));
  });
});
```

---

## 20. Готово к разработке (SDD чек‑лист)

* [x] Цели и границы определены.
* [x] Контракты сообщений и состояния описаны JSON Schema.
* [x] Детекторы и их сигнатуры перечислены.
* [x] UX‑поведение и тексты уведомлений определены.
* [x] NFR/AC заданы.
* [x] Права и структура проекта согласованы.

**Следующий шаг для Codex:** сгенерировать каркас проекта `/extension` по контрактам, подключить линтер, собрать MVP (v0.1.0), прогнать тест‑план, выпустить локальный билд для «Загрузить распакованное».

---

## 21. Макеты интерфейса и шаблоны слотов

### Главная страница

* Базовый набор действий представлен двумя кнопками: `Тест` и `Сохранить`. Используем одинаковые названия для всех макетов без числовых суффиксов, чтобы не вводить пользователей в заблуждение.
* При необходимости различать технические варианты макета используем `data-layout` или поясняющий текст в описании, но не добавляем суффиксы в подписи кнопок.

### Страницы-вкладки

* Внутри вкладок повторяем те же названия кнопок `Тест` и `Сохранить`, сохраняя единый UX на всех уровнях.
* Для навигации между слотами допускаются числовые индексы (например, `Слот 01` … `Слот 15`), так как они отражают саму сущность слота, а не варианты UI.
* В каталоге `frontend-examples/slot-page.html` размещён обновлённый HTML-шаблон страницы слота. Он содержит навигацию по 15 слотам и плейсхолдер `__SLOT_INDEX__`, который достаточно заменить на целевой номер слота (в формате `01` … `15`) при создании очередной страницы. Комментарии в файле описывают порядок замены и правила подсветки активной вкладки.
