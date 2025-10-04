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
2. Показывать системное уведомление «Все задачи завершены», когда счётчик активных задач падает с >0 до 0 (с антидребезгом).
3. Минимум прав: `storage`, `notifications`, `alarms`, `scripting`, `tabs` и `host_permissions` для доменов Codex/ChatGPT (`tabs` требуется background для опроса и очистки вкладок).
4. Приватность: **никаких внешних отправок** данных; только локальное хранение состояния в `chrome.storage.session`.

**Нефункциональные требования (NFR)**

* Работает при неактивной вкладке Codex; корректно переживает «сон» service worker’а (MV3).
* Не вызывает заметной нагрузки (<2% CPU на вкладку в простое, не более 1 DOM‑сканирования в секунду при бурных мутациях благодаря троттлингу `snapshot()` через `requestIdleCallback`/таймер).
* Интернациональность: работает на RU/EN UI.
* Устойчивость к редизайну: несколько независимых детекторов; простое обновление сигнатур.
* Фоновые скрипты применяют настройку `autoDiscardableOff` ко всем вкладкам Codex не позднее нескольких секунд после изменения (проверяется по состоянию `chrome://discards`).

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

* **content‑script** (на страницах `https://*.openai.com/*`):

  * Ставит `MutationObserver` на `document.documentElement`.
  * Периодически/при мутациях вычисляет `activeTasks` (булев флаг + список источников), используя **детекторы**:

    * D1: глобальный индикатор «крутилка» (`[aria-busy="true"]`, `role="progressbar"`, `.animate-spin`, SVG с `animateTransform`).
    * D2: кнопка **Stop/Остановить** в карточках задач на главной странице.
    * D3 (опционально): эвристика заголовков/текста карточек (если D1/D2 недоступны).
  * Шлёт сообщение в **background** с текущим состоянием вкладки.

* **background (service worker)**:
  
  * Агрегирует состояния всех вкладок в `storage.session.state`.
  * Считает `totalActiveCount` (сумма активных по всем вкладкам).
  * Обновляет бейдж на иконке действия расширения (`chrome.action.setBadgeText`) так, чтобы он показывал текущее значение `totalActiveCount`.
  * Если предыдущее значение `> 0`, новое `= 0` и выдержан антидребезг → `chrome.notifications.create(...)`.
  * Таймер `chrome.alarms` (каждую минуту) пингует вкладки, чтобы восстановить статус после сна.

* **popup**:

  * Компактный список активных задач (или «Нет активных»). Ссылки на вкладки.

---

## 5. Контракты и схемы (contract‑first)

### 5.1. Сообщение от content‑script к background

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "codex.tasks/dto/content-update.json",
  "type": "object",
  "required": ["type", "origin", "active", "count", "signals"],
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
          "detector": {"type": "string", "enum": ["D1_SPINNER","D2_STOP_BUTTON","D3_CARD_HEUR" ]},
          "evidence": {"type": "string"}
        }
      }
    },
    "ts": {"type": "number", "description": "epoch ms"}
  }
}
```

> **Примечание:** идентификатор вкладки background получает из `sender.tab.id`, поэтому поле `tabId` в сообщении не требуется. Контент‑скрипт не вычисляет `tabId`, а разрешение `tabs` используется только на стороне background для пингов и очистки состояния вкладок (см. §§2/8/10).

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
        "required": ["origin","active","count","updatedAt"],
        "properties": {
          "origin": {"type": "string"},
          "active": {"type": "boolean"},
          "count": {"type": "integer"},
          "updatedAt": {"type": "number"},
          "signals": {"type": "array", "items": {"type":"string"}}
        }
      }
    },
    "lastTotal": {"type": "integer"},
    "debounce": {"type": "object", "properties": {"ms": {"type":"integer","minimum":0}, "since": {"type":"number"}}}
  }
}
```

### 5.3. Настройки пользователя (UI → storage.sync)

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

`autoDiscardableOff = true` трактуется как запрет на авто‑выгрузку вкладок Codex: background обязан применить `chrome.tabs.update({ autoDiscardable: false })` ко всем найденным вкладкам Codex и поддерживать это состояние. Когда настройка выключена (`autoDiscardableOff = false`), фон возвращает стандартное поведение браузера и вызывает `chrome.tabs.update({ autoDiscardable: true })` для затронутых вкладок.

---

## 6. Детекторы (правила обнаружения)

**D1 — Спиннер**

* Положительные признаки: `[aria-busy="true"]`, `[role="progressbar"]`, элементы с классами вида `.animate-spin`, SVG с `animateTransform`, наличие `aria-label` типа `loading`.
* Для каждого видимого индикатора проверяем текстовое содержимое: если внутри есть цифры, извлекаем первую последовательность, приводим к числу (`parseInt`) и передаём как подсказку `countHint` для расчёта `count` (см. §18).
* Негативные признаки: отображение спиннера внутри скрытых контейнеров (`display:none`, `aria-hidden=true`) — игнорировать.
* Обязательные проверки видимости: элемент и его предки не помечены `aria-hidden="true"`; `offsetParent` существует (либо стиль `position:fixed`), `getComputedStyle` не возвращает `display:none`, `visibility:hidden|collapse`, `opacity:0`.
* Детектор возвращает **коллекцию найденных видимых элементов** вместе с `countHint`, чтобы downstream‑логика могла использовать числовой счётчик как верхнюю границу, а при его отсутствии — присутствие спиннера как минимум одну активную задачу.

**D2 — Кнопка Stop/Остановить**

* Ищем кнопки в карточках задач на главной: `button[aria-label*="Stop" i], button:has(svg[aria-label*="stop" i]), button:contains("Stop"|"Остановить")` (приблизительно; реализация через обход и проверку текста/ARIA).
* Каждый видимый экземпляр такой кнопки добавляется в коллекцию результатов детектора с вычисленным `taskKey` (ближайшая карточка задачи по `data-task-id`/`data-testid*="task"`), чтобы downstream‑логика могла объединить несколько сигналов об одной задаче.
* Детектор должен реагировать на изменение текста кнопки без замены DOM-узла, поэтому `MutationObserver` обязан отслеживать изменения `characterData` (см. §18).

**D3 — Карточки задач (эвристика)**

* Учитываем элементы с data‑атрибутами `data-testid*="task"`, заголовки задач.
* Если карточка помечена как «Running command…»/локализованный эквивалент — считаем активной.
* Детектор возвращает набор карточек, удовлетворяющих условиям и прошедших проверку видимости, с `taskKey`, совпадающим с ключом, который вычисляет D2.
* Аналогично D2, изменения текста внутри карточек (без подмены узлов) должны фиксироваться благодаря `MutationObserver` с `characterData:true` (см. §18).

**Нормализация задач и расчёт `count`**

* Контент-скрипт формирует единый список сигналов, где каждая запись содержит `detector`, `evidence` и (если применимо) `taskKey`.
* Для спиннеров дополнительно фиксируем `countHint` (цифры внутри индикатора); значение участвует только в расчёте `count` и не передаётся в `signals`.
* `taskKey` строится по правилу: `data-task-id` → `data-testid` карточки → `aria-labelledby` → текстовый селектор `describeNode(node)` (см. §18). Это позволяет идентифицировать одну и ту же задачу, даже если её обнаружили разные детекторы.
* Поле `count` вычисляется как максимум из трёх величин: числа уникальных `taskKey`, максимального `countHint` от спиннеров и факта наличия хотя бы одного спиннера (минимум 1 при видимом индикаторе без цифр). В уведомлениях показываем только факт 0/не 0.

**Политика решения:** активной считаем вкладку, если сработал **любой** детектор. Значение `active` фиксирует факт совпадения, а `count` отражает агрегированное количество задач по правилу выше.

---

## 7. UX и поведение

* **Popup**: список активных задач с названием вкладки/временной меткой; «Нет активных» — серый текст. Ссылка «Открыть Codex».
* **Иконка расширения**: обязательный бейдж с точным числом активных задач (суммарно по вкладке); content‑script агрегирует `count` по правилу §6, поэтому background просто ставит это значение на бейдж. При `count = 0` бейдж очищается.
* **Уведомление**: один раз при переходе `>0 → 0`, текст: `Все задачи в Codex завершены` + кнопка `ОК`. Если `sound=true` — проиграть короткий звук (через offscreen document).
* **Детекторы**: фильтруют скрытые элементы (шаблонные спиннеры, `aria-hidden` контейнеры) до расчёта состояния, чтобы исключить ложные уведомления.

**Локализация:** RU/EN строки в словаре; язык по `navigator.language`.

**Доступность (a11y):** роли/aria‑label для списка в popup, фокус на кнопку «ОК» в уведомлении.

---

## 8. Разрешения и политика безопасности

* `host_permissions`: `https://*.openai.com/*` (уточнить производный домен Codex при интеграции).
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
    sound/complete.mp3  # опционально
  /assets
    icon16.png icon48.png icon128.png
  /contracts
    content-update.schema.json
    session-state.schema.json
    settings.schema.json
```

---

## 10. Логика антидребезга и учёт вкладок

* Background хранит `state` с полями `tabs`, `lastTotal` и `debounce` (в `debounce.since` фиксируем момент кандидата на уведомление, в `debounce.ms` — длительность из настроек).
* При каждом `TASKS_UPDATE` пересчитываем `totalActive` как сумму `tab.count` (общее число совпадений по вкладкам).
* Если `totalActive == 0` и раньше было `>0`, стартуем `debounce` (`debounceMs` из настроек). По истечении проверяем ещё раз; если всё ещё `0` — уведомляем.
* При старте и при каждом изменении `autoDiscardableOff` фон перечитывает `chrome.storage.sync` и применяет настройку ко всем вкладкам Codex: `true` → `chrome.tabs.update({ autoDiscardable: false })`, `false` → `chrome.tabs.update({ autoDiscardable: true })`. Новые вкладки Codex получают актуальное значение сразу после появления (например, при первом `TASKS_UPDATE` или `PING`).
* Ежеминутный `PING` из background (через `chrome.tabs.query` + `chrome.tabs.sendMessage`, требует разрешения `tabs`) приводит к `chrome.runtime.onMessage`‑слушателю в content‑script, который вызывает `requestSnapshot()` и восстанавливает состояние вкладки.
* Логика снапшота опирается на `MutationObserver`, который фиксирует структурные и текстовые изменения (`characterData:true`, см. §18), чтобы обновления контента детекторов D2/D3 попадали в обработку даже без замены узлов.
* Состояние вкладки (tabId) очищается обработчиком `chrome.tabs.onRemoved`: фон читает `state`, удаляет `state.tabs[tabId]`, пересчитывает `lastTotal`, при обнулении сбрасывает `debounce.since` и сохраняет обновлённый объект.

---

## 11. Краевые случаи

* Вкладку выгрузили из памяти (tab discard): при следующем открытии контент‑скрипт заново пришлёт статус.
* Codex перестаёт опрашивать сервер в фоне: уведомление может появиться только после следующего видимого изменения DOM. Митигируем минутным `PING` + пересчёт.
* Редизайн Codex ломает селекторы: резервные детекторы + фичефлаги; быстрое обновление через Web Store.

---

## 12. Тест‑план (ручной)

1. Одна вкладка, одна задача → дождаться завершения → одно уведомление.
2. Несколько вкладок (2–3), задачи заканчиваются в разное время → уведомление только когда все завершились.
3. Краткий всплеск спиннера (перезапуск) → уведомление **не** показывается (антидребезг).
4. Неактивная вкладка (свернута) → уведомление приходит.
5. Вкладку закрыли во время выполнения → не считать её активной после закрытия.
6. Проверить обработчик `tabs.onRemoved`: закрыть вкладку, убедиться по popup/логу, что запись о вкладке удалена и антидребезг сброшен.
7. RU/EN локали → корректные тексты.
8. Опция `sound` → звук присутствует/отсутствует.
9. Принудительно «усыпить» вкладку → дождаться `PING` и убедиться, что content‑script ставит в очередь `requestSnapshot()` и состояние восстанавливается.
10. Сценарий бурных мутаций: запустить скрипт, быстро меняющий DOM, и по логам/таймстемпам сообщений убедиться, что `snapshot()` вызывается не чаще 1 раза в секунду.
11. Глобальный спиннер с числовым индикатором (например, «3») при отсутствии карточек → бейдж и popup показывают 3; в сообщении `TASKS_UPDATE` поле `count` равно 3.
12. Одна задача одновременно детектируется D2 и D3 → в бейдже и popup остаётся 1 (дедупликация по `taskKey`).

---

## 13. Критерии приёмки (AC)

* AC‑1: При наличии хотя бы одной активной задачи в любой вкладке иконка показывает ненулевой бейдж с точным числом активных задач (если включено).
* AC‑2: Уведомление «Все задачи завершены» показывается **ровно один раз** при переходе `>0 → 0` с задержкой по настройке.
* AC‑3: Расширение не инициирует сетевые запросы за пределы домена браузера и не отправляет пользовательские данные наружу.
* AC‑4: Работает на неактивных вкладках; после принудительного сна background восстанавливает агрегированное состояние в течение 60 секунд.
* AC‑5: Минимальные permissions; установка проходит без ошибок; в popup виден список активных задач или сообщение об их отсутствии.
* AC‑6: Детекторы не дают ложных срабатываний на скрытые индикаторы (спиннеры/кнопки внутри `aria-hidden`, `display:none`, `visibility:hidden|collapse`, `opacity:0`).

---

## 14. План релиза

* **MVP v0.1.0**: DOM‑детекторы D1/D2, агрегатор, уведомление, popup, RU/EN.
* **v0.2.0**: бейдж, настройки, звуковое оповещение, фичефлаги детекторов.
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
  "version": "0.1.0",
  "permissions": ["storage", "notifications", "alarms", "scripting", "tabs"],
  "host_permissions": ["https://*.openai.com/*"],
  "background": { "service_worker": "src/bg.js" },
  "content_scripts": [
    {
      "matches": ["https://*.openai.com/*"],
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
  D3_CARD_HEUR: () =>
    collectVisible(TASK_CARD_SELECTOR, (node) => /running|выполняется/i.test(node.textContent || '')).map((card) => ({
      node: card,
      taskKey: resolveTaskKey(card)
    }))
};

const SNAPSHOT_MIN_INTERVAL = 1000; // 1 scan/sec максимум
let lastSnapshotAt = 0;
let pendingSnapshot = false;
let idleHandle = null;
let fallbackTimer = null;

function snapshot(){
  const collected = Object.entries(detectors).map(([detector, fn]) => {
    try {
      const matches = fn();
      return { detector, matches };
    } catch {
      return { detector, matches: [] };
    }
  }).filter(({ matches }) => matches.length > 0);

  let spinnerHint = 0;
  let spinnerPresence = 0;
  const taskKeys = new Set();

  const signals = collected.map(({ detector, matches }) => {
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
    });

    const evidenceParts = matches.map(({ taskKey, node }) => taskKey || describeNode(node));
    const uniqueEvidence = Array.from(new Set(evidenceParts));
    return { detector, evidence: uniqueEvidence.join(', ') };
  });

  const uniqueTasks = taskKeys.size;
  const count = Math.max(uniqueTasks, spinnerHint, spinnerPresence > 0 ? 1 : 0);
  const active = count > 0 || collected.length > 0;

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
  characterDataOldValue: true // фиксируем текстовые изменения для детекторов D2/D3
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
  sound: false,
  autoDiscardableOff: true,
  showBadgeCount: true
};

let settings = { ...DEFAULT_SETTINGS };

function applyAutoDiscardable(tabId) {
  if (typeof tabId !== 'number') return;
  const autoDiscardable = settings.autoDiscardableOff ? false : true;
  chrome.tabs.update(tabId, { autoDiscardable });
}

function applyAutoDiscardableToAllCodexTabs() {
  chrome.tabs.query({ url: '*://*.openai.com/*' }, (tabs) => {
    tabs.forEach((tab) => applyAutoDiscardable(tab.id));
  });
}

function refreshSettings() {
  return chrome.storage.sync.get(['settings']).then(({ settings: stored }) => {
    settings = { ...DEFAULT_SETTINGS, ...stored };
    applyAutoDiscardableToAllCodexTabs();
  });
}

refreshSettings();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  const next = changes.settings.newValue;
  settings = { ...DEFAULT_SETTINGS, ...next };
  applyAutoDiscardableToAllCodexTabs();
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'TASKS_UPDATE') return;
  const tabId = sender.tab?.id;
  applyAutoDiscardable(tabId);
  chrome.storage.session.get(['state']).then(({ state }) => {
    const nextState = { ...DEFAULT_STATE, ...state, debounce: { ...DEFAULT_STATE.debounce, ...state?.debounce } };
    nextState.debounce.ms = settings.debounceMs;
    const guaranteedCount = msg.count; // по схеме 5.1 поле обязательно
    const inferredActive = guaranteedCount > 0 ? true : msg.active;
    nextState.tabs = { ...nextState.tabs, [tabId]: { origin: msg.origin, active: inferredActive, count: guaranteedCount, updatedAt: Date.now(), signals: msg.signals?.map(s=>s.detector)||[] } };
    const prevTotal = nextState.lastTotal;
    const total = Object.values(nextState.tabs).reduce((acc,t) => acc + (t.count || 0), 0);
    nextState.lastTotal = total;

    if (prevTotal > 0 && total === 0) {
      nextState.debounce.since = Date.now();
      const waitMs = nextState.debounce.ms;
      setTimeout(async () => {
        const stored = await chrome.storage.session.get(['state']);
        const currentState = { ...DEFAULT_STATE, ...stored.state, debounce: { ...DEFAULT_STATE.debounce, ...stored.state?.debounce } };
        currentState.debounce.ms = settings.debounceMs;
        const stillZero = currentState.lastTotal === 0 && Object.values(currentState.tabs).every(t => (t.count || 0) === 0);
        const debounceElapsed = currentState.debounce.since > 0 && (Date.now() - currentState.debounce.since) >= currentState.debounce.ms;
        if (stillZero && debounceElapsed) {
          chrome.notifications.create({ type:'basic', iconUrl:'assets/icon128.png', title:'Codex', message: 'Все задачи завершены ✅' });
          currentState.debounce.since = 0; // очистка после уведомления
          await chrome.storage.session.set({ state: currentState });
        }
      }, waitMs);
    }

    chrome.storage.session.set({ state: nextState });
  });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { state } = await chrome.storage.session.get(['state']);
  const nextState = {
    ...DEFAULT_STATE,
    ...state,
    tabs: { ...DEFAULT_STATE.tabs, ...state?.tabs },
    debounce: { ...DEFAULT_STATE.debounce, ...state?.debounce }
  };
  nextState.debounce.ms = settings.debounceMs;
  delete nextState.tabs[tabId];
  nextState.lastTotal = Object.values(nextState.tabs).reduce((acc, tab) => acc + (tab.count || 0), 0);
  if (nextState.lastTotal === 0) {
    nextState.debounce.since = 0;
  }
  await chrome.storage.session.set({ state: nextState });
});

chrome.alarms.create('codex-poll', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'codex-poll') return;
  chrome.tabs.query({ url: '*://*.openai.com/*' }, tabs => {
    tabs.forEach(t => chrome.tabs.sendMessage(t.id, { type: 'PING' }));
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
