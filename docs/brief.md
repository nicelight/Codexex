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
* Не вызывает заметной нагрузки (<2% CPU на вкладку в простое, не более 1 DOM‑сканирования в секунду при бурных мутациях благодаря MutationObserver).
* Интернациональность: работает на RU/EN UI.
* Устойчивость к редизайну: несколько независимых детекторов; простое обновление сигнатур.

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
    "count": {"type": "integer", "minimum": 0},
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

---

## 6. Детекторы (правила обнаружения)

**D1 — Спиннер**

* Положительные признаки: `[aria-busy="true"]`, `[role="progressbar"]`, элементы с классами вида `.animate-spin`, SVG с `animateTransform`, наличие `aria-label` типа `loading`.
* Негативные признаки: отображение спиннера внутри скрытых контейнеров (`display:none`, `aria-hidden=true`) — игнорировать.

**D2 — Кнопка Stop/Остановить**

* Ищем кнопки в карточках задач на главной: `button[aria-label*="Stop" i], button:has(svg[aria-label*="stop" i]), button:contains("Stop"|"Остановить")` (приблизительно; реализация через обход и проверку текста/ARIA).
* Наличие хотя бы одной такой кнопки = активная задача.

**D3 — Карточки задач (эвристика)**

* Учитываем элементы с data‑атрибутами `data-testid*="task"`, заголовки задач.
* Если карточка помечена как «Running command…»/локализованный эквивалент — считаем активной.

**Политика решения:** активной считаем вкладку, если сработал **любой** детектор; `count` — наивное число совпадений (для бейджа). В уведомлениях показываем только факт 0/не 0.

---

## 7. UX и поведение

* **Popup**: список активных задач с названием вкладки/временной меткой; «Нет активных» — серый текст. Ссылка «Открыть Codex».
* **Иконка расширения**: бейдж с числом активных задач (суммарно по вкладке) — опционально; content‑script всегда передаёт `count` (целое ≥0), поэтому можно без дополнительных расчётов отображать число.
* **Уведомление**: один раз при переходе `>0 → 0`, текст: `Все задачи в Codex завершены` + кнопка `ОК`. Если `sound=true` — проиграть короткий звук (через offscreen document).

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
* При каждом `TASKS_UPDATE` пересчитываем `totalActive` = сумма `tab.active`.
* Если `totalActive == 0` и раньше было `>0`, стартуем `debounce` (`debounceMs` из настроек). По истечении проверяем ещё раз; если всё ещё `0` — уведомляем.
* Ежеминутный `PING` из background (через `chrome.tabs.query` + `chrome.tabs.sendMessage`, требует разрешения `tabs`) приводит к `chrome.runtime.onMessage`‑слушателю в content‑script, который вызывает `snapshot()` и восстанавливает состояние вкладки.
* Состояние вкладки (tabId) очищается при событии `tabs.onRemoved`.

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
6. RU/EN локали → корректные тексты.
7. Опция `sound` → звук присутствует/отсутствует.
8. Принудительно «усыпить» вкладку → дождаться `PING` и убедиться, что content‑script отвечает `snapshot()` и состояние восстанавливается.

---

## 13. Критерии приёмки (AC)

* AC‑1: При наличии хотя бы одной активной задачи в любой вкладке иконка показывает ненулевой бейдж (если включено).
* AC‑2: Уведомление «Все задачи завершены» показывается **ровно один раз** при переходе `>0 → 0` с задержкой по настройке.
* AC‑3: Расширение не инициирует сетевые запросы за пределы домена браузера и не отправляет пользовательские данные наружу.
* AC‑4: Работает на неактивных вкладках; после принудительного сна background восстанавливает агрегированное состояние в течение 60 секунд.
* AC‑5: Минимальные permissions; установка проходит без ошибок; в popup виден список активных задач или сообщение об их отсутствии.

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
const detectors = {
  D1_SPINNER: () => !!document.querySelector('[aria-busy="true"], [role="progressbar"], .animate-spin, svg[aria-label*="loading" i]'),
  D2_STOP_BUTTON: () => Array.from(document.querySelectorAll('button')).some(b => /stop|остановить/i.test(b.textContent) || /stop/i.test(b.ariaLabel||'')),
  D3_CARD_HEUR: () => Array.from(document.querySelectorAll('[data-testid*="task" i]')).some(n => /running|выполняется/i.test(n.textContent))
};

function snapshot(){
  const signals = Object.entries(detectors)
    .filter(([k,fn]) => { try { return fn(); } catch { return false; } })
    .map(([k]) => ({ detector:k, evidence:'hit' }));
  const active = signals.length > 0;
  const count = Math.max( active ? signals.length : 0, 0 );
  chrome.runtime.sendMessage({ type:'TASKS_UPDATE', origin: location.origin, active, count, signals, ts: Date.now() });
}

const mo = new MutationObserver(() => snapshot());
mo.observe(document.documentElement, { childList:true, subtree:true, attributes:true });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'PING') snapshot();
});

snapshot();
```

---

## 19. Приложение: минимальная логика bg.js (псевдокод)

```js
const DEFAULT_STATE = {
  tabs: {},
  lastTotal: 0,
  debounce: { ms: 12000, since: 0 }
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'TASKS_UPDATE') return;
  const tabId = sender.tab?.id;
  chrome.storage.session.get(['state']).then(({ state = { tabs:{} } }) => {
    const guaranteedCount = msg.count; // по схеме 5.1 поле обязательно
    state.tabs[tabId] = { origin: msg.origin, active: msg.active, count: guaranteedCount, updatedAt: Date.now(), signals: msg.signals?.map(s=>s.detector)||[] };
    const total = Object.values(state.tabs).reduce((acc,t) => acc + (t.active ? 1 : 0), 0);
    chrome.storage.session.set({ state, lastTotal: total });

    if (lastTotal > 0 && total === 0) {
      zeroSince = Date.now();
      setTimeout(async () => {
        const { lastTotal: cur, state: st } = await chrome.storage.session.get(['lastTotal','state']);
        const stillZero = Object.values(st.tabs).every(t => !t.active);
        if (stillZero) {
          chrome.notifications.create({ type:'basic', iconUrl:'assets/icon128.png', title:'Codex', message: 'Все задачи завершены ✅' });
        }
      }, debounceMs);
    }
  });
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
