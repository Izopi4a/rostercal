# Changelog

All notable changes to `@izopi4a/rostercal` are listed here.

This project is pre-1.0. While in `0.x`, minor version bumps may include breaking changes. They will always be called out in this file.

## [0.3.0] — 2026-05-23

### Added

- **`slotMinTime` / `slotMaxTime`** (resource-time-grid). Accept `"HH:MM"` strings and clamp the visible axis to a working window. Both bounds must align to `slotMinutes`. Events fully outside the window are hidden; events spanning the boundary are clipped visually (underlying data unchanged). Defaults preserve the previous full-day behavior (`"00:00"` / `"24:00"`).
- **`blockedRanges`** (resource-time-grid). Declarative non-droppable time windows on a single resource column. Rendered with a striped overlay behind events.
  - New CSS variables `--rc-blocked-bg` and `--rc-blocked-stripe` for theming.
  - Companion option `allowDropOnBlocked` (default `false`) opts back in to drops.
  - New imperative API: `cal.setBlockedRanges`, `cal.getBlockedRanges`, `cal.isBlocked(date, resourceId)`.
- **`dropRejected`** event. Fires with `{ reason: "blocked", date, resourceId }` when a drop is refused by the calendar. `eventDrop` / `externalDrop` are suppressed in that case.
- **`eventContent`** render hook. Replace the default time/title body of every event. Accepts `HTMLElement | DocumentFragment | string` (strings are inserted as text — never as HTML). `eventDidMount` still fires afterwards as an escape hatch.

### Changed

- The resource-time-grid axis now renders one row per slot (rather than per hour). Hour labels appear on hour-boundary rows; sub-hour rows carry the class `rc-rtg__hour--sub` and are visually empty. This is the only way to keep axis labels aligned with slot lines when `slotMinTime` / `slotMaxTime` are mid-hour.
- The README no longer carries a "Non-goals" list. The only hard exclusion remains "no recurring events" — documented inline near event input where it's actually load-bearing.

### Migration notes

- Existing code is unaffected unless you depended on the old "exactly 24 `.rc-rtg__hour` cells" DOM shape. If you did, count `:not(.rc-rtg__hour--sub)` instead.
- If you previously mimicked blocked hours by toggling classes in `slotDidMount`, prefer `blockedRanges` — it survives re-renders, doesn't depend on internal DOM, and integrates with the drop pipeline.

## [0.2.0]

- Document `hour12` / `timezone`, slot mount hook; drop unused CRUD flags.

## [0.1.0]

- Initial release. Month view + Resource Time Grid. CRUD adapter (URL shorthand + function form). Drag-and-drop via Pointer Events. Light / dark / high-contrast themes.
