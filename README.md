# rostercal

A small calendar library. Two views — **Month** and **Resource Time Grid** — MIT, zero runtime dependencies.

Built for worker scheduling (duty rosters, shift rosters, crew rosters). TypeScript-first API and built-in drag & drop.

**Status:** pre-release (v0). API is stable enough to build on; published on npm as [`@izopi4a/rostercal`](https://www.npmjs.com/package/@izopi4a/rostercal).

---

## Install

```sh
npm install @izopi4a/rostercal
```

## Import styles

```ts
import "@izopi4a/rostercal/styles";          // light theme (default)
import "@izopi4a/rostercal/themes/dark.css"; // or dark
import "@izopi4a/rostercal/themes/high-contrast.css";
```

---

## Quick start

### Month view

```ts
import { Calendar } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const cal = new Calendar(document.getElementById("cal")!, {
  view: "month",
  events: [
    { id: "1", title: "Team standup", start: "2026-05-14T09:00", end: "2026-05-14T09:30" },
  ],
});
cal.render();
```

### Resource Time Grid view

```ts
const cal = new Calendar(document.getElementById("cal")!, {
  view: "resource-time-grid",
  resources: [
    { id: "a", title: "Worker A" },
    { id: "b", title: "Worker B" },
    { id: "c", title: "Worker C" },
  ],
  events: [
    { id: "1", title: "Appointment", start: "2026-05-14T14:00", end: "2026-05-14T15:00", resourceId: "a" },
  ],
  slotMinutes: 30,
});
cal.render();
```

---

## Options

```ts
new Calendar(element, options)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | `"month" \| "resource-time-grid"` | `"month"` | Initial view |
| `date` | `Date` | `new Date()` | Initial focus date |
| `firstDayOfWeek` | `0–6` | `0` | `0` = Sunday, `1` = Monday, … |
| `locale` | `string` | `"en-US"` | Passed to `Intl.DateTimeFormat` |
| `theme` | `string` | `"light"` | `"light"`, `"dark"`, `"high-contrast"`, or a custom string |
| `events` | `RosterEvent[]` | `[]` | Initial events |
| `resources` | `Resource[]` | `[]` | Resources (required for resource-time-grid) |
| `data` | `CrudAdapter` | — | Backend sync adapter (see [CRUD adapter](#crud-adapter)) |
| `dnd` | `boolean` | `true` | Enable drag & drop |
| `slotMinutes` | `number` | `30` | Minutes per time slot (resource-time-grid only) |
| `hour12` | `boolean` | follows `locale` | Force 12 or 24-hour clock for time labels |
| `timezone` | `"local" \| "UTC"` | `"local"` | Clock used for positioning and labelling |
| `eventDidMount` | `(info) => void` | — | Called after each event element is built and inserted. `info: { event, el }` |
| `slotDidMount` | `(info) => void` | — | Resource-time-grid only. Called for each empty slot cell. `info: { date, resourceId, el }` |

---

## Types

### `RosterEvent`

```ts
interface RosterEvent {
  id: string;
  title: string;
  start: Date | string;          // ISO string accepted
  end?: Date | string;
  allDay?: boolean;              // month view only; ignored by resource-time-grid
  resourceId?: string;           // required for resource-time-grid
  color?: string;                // CSS color, overrides theme default
  extendedProps?: Record<string, unknown>;
}
```

### `Resource`

```ts
interface Resource {
  id: string;
  title: string;
  order?: number;                // column sort order
}
```

---

## Imperative API

```ts
// Events
cal.addEvent(event: RosterEvent): RosterEvent
cal.updateEvent(id: string, patch: Partial<RosterEvent>): RosterEvent
cal.removeEvent(id: string): void
cal.getEvent(id: string): RosterEvent | undefined
cal.getEvents(): RosterEvent[]

// Resources
cal.addResource(resource: Resource): Resource
cal.removeResource(id: string): void
cal.getResources(): Resource[]

// Navigation
cal.next(): void        // next month or next day
cal.prev(): void
cal.today(): void
cal.setDate(date: Date): void
cal.setView(view: "month" | "resource-time-grid"): void
cal.getView(): ViewName
cal.getDate(): Date

// Other
cal.setTheme(theme: string): void
cal.destroy(): void
```

---

## Event listeners

```ts
cal.on("eventClick",   ({ event, native }) => { … });
cal.on("eventDrop",    ({ event, oldStart, oldEnd }) => { … });
cal.on("eventResize",  ({ event, oldStart, oldEnd }) => { … });
cal.on("dateClick",    ({ date, resourceId? }) => { … });
cal.on("viewChange",   ({ view, date }) => { … });
cal.on("dataError",    ({ op, error }) => { … });
cal.on("externalDrop", ({ date, resourceId }) => { … });   // external draggable dropped on RTG

cal.off("eventClick", handler);   // or use the unsubscribe returned by on()
```

`on()` returns an unsubscribe function. Handlers may return a `Promise`; the calendar awaits it where the result matters (e.g. rejecting an `eventDrop` handler rolls back the move).

**Rolling back a drop:**

```ts
cal.on("eventDrop", async ({ event, oldStart }) => {
  const ok = await saveToServer(event);
  if (!ok) throw new Error("rejected"); // calendar reverts the event
});
```

---

## CRUD adapter

Wire the calendar to your backend without changing how either side works. Every operation is either a URL+method shorthand or a plain async function — your choice per operation.

### URL shorthand

```ts
const cal = new Calendar(el, {
  data: {
    list:   "GET /api/events",
    create: "POST /api/events",
    update: "PATCH /api/events/:id",
    delete: "DELETE /api/events/:id",
  },
});
```

URL placeholders: `:id` → event id, `:from` / `:to` → visible date range.

### Function form

```ts
const cal = new Calendar(el, {
  data: {
    list:   ({ from, to }) => myClient.query(GET_EVENTS, { from, to }),
    create: (event)        => myClient.mutate(CREATE_EVENT, event),
    update: (event)        => myClient.mutate(UPDATE_EVENT, event),
    delete: (id)           => myClient.mutate(DELETE_EVENT, { id }),
    fromServer: (raw)      => mapDtoToRosterEvent(raw),
  },
});
```

### Full options

```ts
interface CrudAdapter {
  list?:       OpString | ((range: { from: Date; to: Date }) => Promise<unknown>);
  create?:     OpString | ((event: RosterEvent) => Promise<unknown>);
  update?:     OpString | ((event: RosterEvent) => Promise<unknown>);
  delete?:     OpString | ((id: string) => Promise<unknown>);

  fromServer?: (raw: unknown) => RosterEvent | RosterEvent[];  // transform server → RosterEvent
  toServer?:   (event: RosterEvent) => unknown;                 // transform RosterEvent → server
  fetcher?:    (input: RequestInfo, init?: RequestInit) => Promise<Response>; // custom fetch (auth, base URL)
}
```

Operations are **optimistic** — changes appear instantly and roll back if the server rejects them. The `dataError` event fires on any failure.

---

## Theming

Switch themes via constructor option, the imperative API, or a data attribute:

```ts
new Calendar(el, { theme: "dark" });
cal.setTheme("dark");
// or
document.getElementById("cal").dataset.rostercalTheme = "dark";
```

Built-in themes: `light` (default), `dark`, `high-contrast`.

### Custom theme

All themable values are CSS custom properties under `.rostercal`. Override them in your own stylesheet:

```css
[data-rostercal-theme="brand"] {
  --rc-accent:    #e63946;
  --rc-today-bg:  #fff0f0;
  --rc-bg:        #fafafa;
}
```

If you use SCSS and want to build against the source tokens:

```scss
@use "@izopi4a/rostercal/scss/tokens" as *;
```

---

## Browser support

Last 3 versions of Chrome, Edge, and Firefox. Safari: best-effort (untested). No IE.

Drag & drop is built on [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) — no library, no HTML5 DnD API. Works with mouse, touch, and pen uniformly.

---

## Non-goals

- No recurring events. Ever. Supply the expanded list of events yourself.
- No week, day, list, or year views in v0.
- No timezone math beyond UTC and the browser's local zone.

---

## License

MIT
