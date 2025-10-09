## Action Indicator Specification

- Aggregator передаёт `totalActiveCount` в контроллер toolbar badge.
- Основной путь: chrome.action-иконка перерисовывается через OffscreenCanvas (`setIcon`) в размерах 16/24/32 px на полностью прозрачном фоне.
- Палитра текста: `0` → `#16A34A`, `1` → `#F97316`, `2` → `#F2542D`, `3` → `#E11D48`, `>=4` → `#C2185B`.
- Отображаемое значение ограничено диапазоном `0…9`; любые `>=10` визуализируются как `9`.
- Типографика: жирный шрифт (weight 900), масштаб ~92% от стороны, лёгкий stroke для контраста.
- Fallback: если OffscreenCanvas/ImageData недоступны, включается badge-text с той же палитрой.
- Tooltip локализован: en "{n} active Codex tasks", ru "{n} активных задач Codex".
- Обновления chrome.action троттлятся (>=200 мс) и используют `setBadgeBackgroundColor`, `setIcon`/`setBadgeText`, `setTitle`.