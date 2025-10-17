#  Codexex
> CODEXEX - это лёгкое расширение для **Codex Cloud** (for Chrome)

Порой кодекс автономно работает по 10-30 минут. Наблюдались лонгворкинги до 7 часов автономной работы.
 
Расширение показывает сколько тасок активно на данный момент. Можно воспроизвети тын-дын когда все таски выполнены. 




<p align="center">
  <a href="https://github.com/nicelight/Codexex/releases/tag/v0.1.1">
    <img alt="logo" src="https://img.shields.io/badge/Codex-Tasks%20Watcher-8A2BE2?style=for-the-badge&logo=google-chrome&logoColor=white">
  </a>
  <a href="https://github.com/nicelight/Codexex/blob/main/dist/manifest.json">
    <img alt="mv3" src="https://img.shields.io/badge/Manifest-V3-2E8B57?style=for-the-badge">
  </a>
  <a href="./docs/PRIVACY.md">
    <img alt="privacy" src="https://img.shields.io/badge/Privacy-Local%20Only-1E90FF?style=for-the-badge">
  </a>
</p>


## Скриншот
 ![Внешний вид](codexex.png)

---


## Как это работает

* content‑script наблюдает DOM: ловит крутилки, кнопки Stop и другие признаки активности.
* background сводит сигналы со всех вкладок и решает, когда пора предупредить.
* popup просто показывает текущее состояние.

### Как это работает

```mermaid
flowchart LR
  DOM[Наблюдаем DOM] --> BG[Background собирает статусы]
  BG -->|есть активные| Wait[Продолжаем ждать]
  BG -->|всё пусто| Check[Проверка задержки]
  Check -->|тишина| Notify[Показываем уведомление]
```

---

## Быстрый старт
### Либо скачать вручную
1. [Забираем архив из Релизов](https://github.com/nicelight/Codexex/releases/tag/v0.1.1)
2. Распаковываем и добавляем в расширения Хрома.
3. 
### Либо клон репозитория 
1. Склонировать репозиторий:

   ```bash
   git clone https://example.com/codex-tasks-watcher.git
   cd codex-tasks-watcher/extension
   ```
2. Открыть `chrome://extensions` → включить **Режим разработчика** → **Загрузить распакованное** и выбрать папку `extension`.
3. Открыть Codex и запустить задачу. Свернуть вкладку. Дождаться уведомления.

Структура каталога расширения минималистична: `manifest.json`, пара скриптов и html в `src`, иконки лежат в `assets`.

---

## Права и безопасность

Расширению нужны стандартные разрешения: `https://*.openai.com/*`, доступ к `storage`, `notifications`, `alarms`, `scripting` и, при необходимости, `tabs`, чтобы удерживать рабочие вкладки. Вся логика крутится на стороне браузера, наружу ничего не уходит, а рабочие данные живут в `chrome.storage.session`.

---

## Настройки

Фоновые сервисы читают настройки из `chrome.storage.sync` и применяют их без перезагрузки:

* `debounceMs` — длительность окна антидребезга (0–60000 мс, по умолчанию 12000).
* `autoDiscardableOff` — запрещает (`true`) или разрешает (`false`) авто‑выгрузку вкладок Codex.
* `sound` / `soundVolume` — включают аудио‑сигнал и управляют громкостью.
* `showBadgeCount` — резерв под бейдж иконки.

UI для изменения значений в разработке; до релиза можно задавать параметры вручную через DevTools (`chrome.storage.sync.set`).

---

## Диаграммы

### Компоненты

```mermaid
flowchart TB
  CS[content script] --> SW[background]
  SW --> POP[popup]
  CS --> DOM[страница Codex]
```
### Взаимодействие компонентов 
```mermaid 
graph TD
    CS(ContentScriptRuntime) -->|TASKS_UPDATE / TASKS_HEARTBEAT| AGG(Aggregator)
    AGG -->|state change| NOTIF(Notifications)
    AGG -->|state change| AUDIO(AudioTrigger)
    AGG -->|state change| BADGE(ActionIndicator)
    AGG -->|evaluateHeartbeatStatuses| ALARM(Alarms)
    ALARM -->|PING| CS
    POPUP[Popup UI] -->|POPUP_GET_STATE| AGG
    POPUP -->|load/save settings| SYNC[(chrome.storage.sync)]
    AGG -->|persist| SESSION[(chrome.storage.session)]
    AUDIO -->|AUDIO_CHIME / SETTINGS_UPDATE| CS
```

### Машина состояний уведомления

```mermaid
stateDiagram-v2
  [*] --> Waiting
  Waiting --> Armed: сумма стала больше 0
  Armed --> Debouncing: сумма стала 0
  Debouncing --> Notified: выдержана задержка
  Notified --> Waiting: запущена новая задача
```

### Тригер завершенных задач
```mermaid
sequenceDiagram
    participant DOM as Codex DOM
    participant CS as ContentScriptRuntime
    participant BG as Background Aggregator
    participant CTRL as Notifications/Audio
    participant USER

    DOM->>CS: Mutation/idle tick
    CS->>CS: ActivityScanner.scan()
    CS->>BG: TASKS_UPDATE(active=false,count=0,signals)
    BG->>BG: applyDebounceTransition()
    BG->>CTRL: idle settled event (после debounce)
    CTRL->>USER: Chrome notification +/− звук
```

---

## Тесты вручную

Полезно пробежать по нескольким сценариям: одна вкладка (уведомление одно), две вкладки (сигнал только после опустошения обеих), мигающий спиннер (антидребезг гасит ложный сигнал) и свёрнутая вкладка (уведомление всё равно приходит).

---

## FAQ

**Работает ли в неактивной вкладке?** Да, если Chrome не выгрузил её из памяти.

**Что если Codex изменит верстку?** Детекторы перестроим, когда увидим изменения.

**Нужен ли интернет?** Нет, расширение не зовёт внешние сервисы.

---

## Роадмап

* v0.1: DOM‑детекторы, уведомление, popup, RU\EN
* v0.2: бейдж, настройки, звук
* v0.3: мягкий перехват fetch для повышения точности

```mermaid
timeline
  title Этапы
  Q1 : Инициация, MVP
  Q2 : Настройки, звук
  Q3 : Улучшение детекции
```

---

## Лицензия

MIT © Автор проекта
