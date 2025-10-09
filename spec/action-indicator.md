## Action Indicator Specification

- Toolbar badge mirrors aggregated totalActiveCount published by the background aggregator.
- Badge background uses RGBA [0,0,0,0]; blank icons (16/24/32 px) keep the action transparent.
- Text palette by level: 0 #16A34A, 1 #F97316, 2 #F2542D, 3 #E11D48, 4+ #C2185B.
- Values >= 100 collapse to 99+.
- Tooltip string is localized: "{n} active Codex tasks".
- Background worker updates badge via chrome.action APIs with throttling to avoid MV3 wakeups.
