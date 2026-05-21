# rostercal — Spec (v0)

A small, opinionated calendar library. Two views. No paywall. Vanilla TypeScript core; framework wrappers ship as separate packages.

> Status: **draft for review**. Nothing here is final until izopi4a signs off.

---

## 1. Goals & non-goals

### Goals
- Ship **two views only**: Month, and Resource Time Grid.
- TypeScript-first public API, distributed as ESM.
- Zero runtime dependencies.
- Theming via SCSS source + compiled CSS, customizable through CSS custom properties.
- Imperative API (`addEvent`, `removeEvent`, `getEvents`, …).
- Optional **backend-agnostic** CRUD: user wires each operation to their own endpoint or fetcher.
- Drag & drop written against Pointer Events (no library, no HTML5 DnD API).

### Non-goals
- Week, Day, List, Year, or Timeline views. Not now, maybe never.
- **No recurring events, ever.** Whatever events the user supplies (or the `list` endpoint returns) are exactly what gets rendered. If a user wants a daily standup, they create N events. We will not ship an RRULE engine, an `rrule` field, or sugar that expands one event into many.
- Internationalization beyond what `Intl.DateTimeFormat` and `Intl.Locale` give us for free.
- Timezone math beyond UTC + the browser's local zone. No `moment-timezone` equivalent.
- Server-side rendering parity. Aim for "doesn't crash in SSR"; rendering happens client-side.

### License
MIT.

### Browser support
- Target: **last 3 versions** of Chrome, Edge, and Firefox (`last 3 versions` in browserslist terms).
- Safari: **best-effort, untested.** Pointer Events and the rest of our stack are supported there, so it should work, but we don't gate releases on it.
- IE and legacy Edge: explicitly unsupported.

---

## 2. Repo & package layout

```
rostercal/                        ← this repo, vanilla TS core
├── src/
│   ├── core/
│   │   ├── Calendar.ts           ← main class, public entrypoint
│   │   ├── EventStore.ts         ← in-memory event collection
│   │   ├── dates.ts              ← date math, week-start, day spans
│   │   └── types.ts              ← public TS types
│   ├── views/
│   │   ├── View.ts               ← shared view interface
│   │   ├── month/
│   │   └── resource-time-grid/
│   ├── dnd/
│   │   └── DragController.ts     ← Pointer Events drag/drop
│   ├── data/
│   │   └── CrudAdapter.ts        ← optional fetch-driven sync
│   └── styles/
│       ├── _tokens.scss          ← CSS custom property declarations
│       ├── _base.scss
│       ├── _month.scss
│       ├── _resource-time-grid.scss
│       ├── themes/
│       │   ├── light.scss
│       │   ├── dark.scss
│       │   └── high-contrast.scss
│       └── index.scss            ← single import for consumers
├── tests/
│   ├── unit/
│   └── e2e/                      ← Playwright
├── examples/                     ← Vite-powered demo site, self-hosted by izopi4a as a Docker image
│   ├── index.html                ← landing page, links to each demo
│   ├── month-basic/
│   ├── month-themes/
│   ├── rtg-worker-scheduling/
│   ├── rtg-many-resources/
│   ├── dnd/
│   ├── crud-url-shorthand/
│   ├── crud-function-form/
│   ├── imperative-api/
│   ├── nginx.conf                ← static-serve config for the Docker image
│   └── vite.config.ts
├── Dockerfile                    ← multi-stage build, outputs nginx:alpine image
├── .github/workflows/            ← CI + build/push image to izopi4a's registry
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
└── SPEC.md                       ← this file
```

The `examples/` directory is excluded from the published npm package via `package.json#files`.

**Publishing:**
- Name: `@izopi4a/rostercal` (scoped, confirmed available on npm).
- Type: `module` (ESM-only).
- Entrypoints:
  - `import { Calendar } from "@izopi4a/rostercal"`
  - `import "@izopi4a/rostercal/styles"` (compiled CSS, light theme by default)
  - `import "@izopi4a/rostercal/themes/dark.css"` (other themes)
- Source SCSS exported under `@izopi4a/rostercal/scss/*` for users who want to compile against the tokens themselves.

**Framework wrappers (separate repos, future):**
- `@izopi4a/rostercal-react`
- `@izopi4a/rostercal-vue`

Each wrapper depends on the core, exposes a single component, and re-exports the core types.

---

## 3. Public API

### 3.1 Constructing a calendar

```ts
import { Calendar } from "@izopi4a/rostercal";

const calendar = new Calendar(document.getElementById("cal")!, {
  view: "month",                 // "month" | "resource-time-grid"
  date: new Date(),              // initial focus date
  firstDayOfWeek: 0,             // 0 = Sun, 1 = Mon
  locale: "en-US",               // passed to Intl.DateTimeFormat
  theme: "light",                // "light" | "dark" | "high-contrast" | custom string
  events: [/* RosterEvent[] */], // optional initial events
  resources: [/* Resource[] */], // required for resource-time-grid view
  data: { /* CrudAdapter, optional */ },
  dnd: true,                     // enable drag & drop
});

calendar.render();
```

### 3.2 Event shape

```ts
interface RosterEvent {
  id: string;                    // user-supplied, required
  title: string;
  start: Date | string;          // ISO string accepted
  end?: Date | string;           // omit for point events
  allDay?: boolean;              // month view only; ignored by resource-time-grid
  resourceId?: string;           // required for resource-time-grid
  color?: string;                // optional override
  extendedProps?: Record<string, unknown>;
}
```

### 3.3 Resource shape (resource-time-grid only)

```ts
interface Resource {
  id: string;
  title: string;
  order?: number;
}
```

### 3.4 Imperative API

```ts
calendar.addEvent(event: RosterEvent): RosterEvent;
calendar.updateEvent(id: string, patch: Partial<RosterEvent>): RosterEvent;
calendar.removeEvent(id: string): void;
calendar.getEvent(id: string): RosterEvent | undefined;
calendar.getEvents(): RosterEvent[];

calendar.addResource(resource: Resource): Resource;
calendar.removeResource(id: string): void;
calendar.getResources(): Resource[];

calendar.setView(view: "month" | "resource-time-grid"): void;
calendar.setDate(date: Date): void;
calendar.next(): void;          // next month / next day
calendar.prev(): void;
calendar.today(): void;

calendar.setTheme(theme: string): void;
calendar.destroy(): void;
```

### 3.5 Events (the listener kind)

```ts
calendar.on("eventClick",   (e: { event: RosterEvent, native: MouseEvent }) => …);
calendar.on("eventDrop",    (e: { event: RosterEvent, oldStart: Date, oldEnd?: Date }) => …);
calendar.on("eventResize",  (e: { event: RosterEvent, oldStart: Date, oldEnd?: Date }) => …);
calendar.on("dateClick",    (e: { date: Date, resourceId?: string }) => …);
calendar.on("viewChange",   (e: { view: string, date: Date }) => …);
calendar.on("dataError",    (e: { op: "list"|"create"|"update"|"delete", error: unknown }) => …);
```

Handlers may return a `Promise`; the calendar awaits them when the result matters (e.g., to roll back a drop on rejection).

### 3.6 CRUD adapter (the interesting one)

**Backend-agnostic.** No assumed routes, no assumed response envelope. Every operation can be either a URL+method shorthand or a user-supplied function.

```ts
type OpString = `${"GET"|"POST"|"PATCH"|"PUT"|"DELETE"} ${string}`;

interface CrudAdapter {
  list?:   OpString | ((range: { from: Date; to: Date }) => Promise<unknown>);
  create?: OpString | ((event: RosterEvent) => Promise<unknown>);
  update?: OpString | ((event: RosterEvent) => Promise<unknown>);
  delete?: OpString | ((id: string) => Promise<unknown>);

  // Optional: transform server payloads ↔ RosterEvent
  fromServer?: (raw: unknown) => RosterEvent | RosterEvent[];
  toServer?:   (event: RosterEvent) => unknown;

  // Optional: full fetcher override (auth headers, base URL, etc.)
  fetcher?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;

  // Behavior knobs
  optimistic?: boolean;   // default true — apply locally, roll back on error
  debounceMs?: number;    // batch rapid updates from drag
}
```

**Examples:**

```ts
// Simplest: REST-ish endpoints
data: {
  list:   "GET /api/events",
  create: "POST /api/events",
  update: "PATCH /api/events/:id",
  delete: "DELETE /api/events/:id",
}

// Non-REST backend (RPC, GraphQL, custom): pass functions
data: {
  list:   ({ from, to }) => myClient.query(GET_EVENTS, { from, to }),
  create: (event) => myClient.mutate(CREATE_EVENT, event),
  update: (event) => myClient.mutate(UPDATE_EVENT, event),
  delete: (id)    => myClient.mutate(DELETE_EVENT, { id }),
  fromServer: (raw) => mapMyDtoToRosterEvent(raw),
}
```

URL placeholders supported: `:id` substituted from the event id; `:from` / `:to` substituted from the visible range.

---

## 4. Views

### 4.1 Month view
- 6-row × 7-column grid of `Day` cells.
- Day cells in the previous/next month are dimmed but rendered (for layout stability).
- Events that span multiple days render as a single bar across cells, broken at week boundaries.
- Cell event overflow: show first N events (configurable, default 3) then "+X more" that opens a popover with the full list.
- All-day events stack above timed events within the cell.

### 4.2 Resource Time Grid view

**Canonical use case:** a working calendar. Workers A, B, C as vertical columns. The day split into 30-minute rows. Worker A has an appointment 14:00–15:00 with a title. That's the entire UX target — keep it close to that.

- Columns = resources (1 to N), rows = time slots.
- Time slot height configurable (`slotMinutes`, default 30).
- Day range fixed to a single day in v0. Multi-day support deferred.
- **No all-day row in v0.** All events are timed. If a `RosterEvent` with `allDay: true` is supplied to this view, it is ignored and a console warning is emitted.
- Y-axis: 00:00–24:00 with auto-scroll-to-now on initial render.
- Overlapping events on the same resource are laid out side-by-side, splitting the column width.

### 4.3 Shared view contract

```ts
interface View {
  mount(container: HTMLElement, ctx: ViewContext): void;
  unmount(): void;
  update(ctx: ViewContext): void;   // called on event/date/resource changes
  getVisibleRange(): { from: Date; to: Date };
}
```

Views never own state — they read from the `Calendar` instance and emit user intents back through callbacks.

---

## 5. Drag & drop

Custom implementation over **Pointer Events**. Single `DragController` reused by both views.

### What it handles
- **Move:** drag an event body to a new day (month view) or new time/resource (RTG view).
- **Resize:** drag the trailing edge of an event to extend its end.
- **Touch + mouse + pen** uniformly via `pointerdown` / `pointermove` / `pointerup` / `pointercancel`.

### Lifecycle
1. `pointerdown` on a draggable element → capture pointer, record origin.
2. After `dragThresholdPx` (default 4px) of movement → enter drag mode, add `data-rostercal-dragging` attribute on the root, emit `dragStart`.
3. `pointermove` → ghost element follows the cursor; underlying cells highlight via hit-testing.
4. `pointerup` → snap to nearest valid drop target (day cell or time slot), emit `eventDrop` or `eventResize`.
5. `pointercancel` or `Escape` → revert.

### Why not HTML5 DnD
- No touch support without polyfill.
- Browser-controlled drag image is hard to style.
- Inconsistent `dragenter`/`dragleave` semantics across browsers.

If our implementation proves too fiddly, we'll re-evaluate. We're committed to trying first.

---

## 6. Theming

- All themable values declared as CSS custom properties under a single `.rostercal` scope.
- Theme = a stylesheet that overrides those properties. Switching themes = swapping the stylesheet or setting `data-rostercal-theme="dark"` on the root.
- Ship three themes: `light` (default), `dark`, `high-contrast`.
- Token categories: colors (bg, fg, border, accent, today-highlight, event-bg, event-fg), spacing scale, radii, font stack, z-index layers.

```scss
// tokens.scss (abridged)
.rostercal {
  --rc-bg:               #fff;
  --rc-fg:               #1a1a1a;
  --rc-border:           #e0e0e0;
  --rc-accent:           #2b7fff;
  --rc-today-bg:         #fff8d6;
  --rc-event-bg:         var(--rc-accent);
  --rc-event-fg:         #fff;
  --rc-radius:           4px;
  --rc-cell-min-height:  96px;
  /* … */
}
```

Users who want a custom theme write their own stylesheet overriding these tokens. No build step required on their side.

---

## 7. Build & tooling

| Concern | Choice |
|---|---|
| Language | TypeScript 6.0.3 |
| Module format | ESM only |
| Build (TS) | `tsc` directly, output to `dist/` |
| Build (SCSS) | `sass` CLI to `dist/styles/*.css` |
| Test (unit) | Vitest + jsdom |
| Test (e2e) | Playwright (drag & drop, view interactions) |
| Lint | ESLint + `@typescript-eslint` |
| Format | Prettier |
| CI | GitHub Actions: lint, typecheck, unit, e2e, build, publish dry-run |
| Coverage | Vitest's `--coverage`, collected but **not gated** in CI (revisit later) |

No bundler. We ship one ESM tree that Vite/webpack/Rollup consumers tree-shake themselves.

---

## 8. Examples site

A static demo site lives in `examples/` and is **self-hosted** by izopi4a on his own VM/domain (TBD). The library evolves alongside its examples — every milestone adds at least one demo so the public API gets exercised from a consumer's point of view as it's being built.

### Tooling
- **Vite** for dev server + static build. Dev-only dependency; **not** a runtime dep of the published package and **not** something library consumers need.
- Example sources import directly from `../src/` during dev, giving HMR while iterating on the library itself.
- `vite build` produces a plain static bundle (HTML/JS/CSS).

### Hosting (self-hosted Docker)
- A `Dockerfile` at the repo root builds a small static-serving image (multi-stage: Node build stage → `nginx:alpine` serve stage).
- CI builds the image and pushes it to izopi4a's private registry on every push to `main`. Registry URL + credentials are GitHub Actions secrets, not committed.
- Deployment to the VM (pull + restart container) is handled by izopi4a outside this repo. The repo's responsibility ends at "a tagged image is in the registry."
- No GitHub Pages, no Netlify/Vercel/etc.

```dockerfile
# Dockerfile (sketch — final version lands in M1)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:examples

FROM nginx:alpine
COPY --from=build /app/examples/dist /usr/share/nginx/html
COPY examples/nginx.conf /etc/nginx/conf.d/default.conf
```

### Starting set of demos
| Demo | Purpose | Milestone introduced |
|---|---|---|
| `month-basic` | Month view, hardcoded events | M2 |
| `month-themes` | Theme switcher | M2 |
| `imperative-api` | Buttons calling `addEvent` / `setView` / `next` / etc. | M3 |
| `dnd` | Drag-and-drop move + resize on month view | M4 |
| `rtg-worker-scheduling` | Canonical worker scheduling example | M5 |
| `rtg-many-resources` | Many columns, overlapping events | M5 |
| `crud-url-shorthand` | CRUD adapter, URL shorthand, localStorage-backed mock | M6 |
| `crud-function-form` | CRUD adapter, function form against a custom client | M6 |

Each demo has its own `index.html` and a single `.ts` file. The `examples/index.html` landing page links to all of them with a short blurb each.

### What the examples site is NOT
- Not a documentation site. README is the docs surface in v0.
- Not an issue tracker, not a download portal, not a marketing page. Plain demos.

---

## 9. Testing strategy

- **Unit (Vitest + jsdom):** date math, event store mutations, CRUD adapter URL templating, view layout pure functions (event placement, overlap resolution).
- **Component (Vitest + jsdom):** mount a view, assert DOM structure for a fixture set of events.
- **E2E (Playwright):** drag-and-drop interactions on both views, theme switching, keyboard nav, accessibility smoke (axe-core).
- **No** snapshot tests for full DOM trees — too brittle. Target specific elements.

Every public API method gets at least one unit test. Every emitted event gets at least one assertion.

---

## 10. Accessibility

- Calendar root is `role="application"` with a labelled region.
- Day cells: `role="gridcell"`, focusable, arrow-key navigation between cells.
- Events: focusable, Enter/Space to activate, Delete to remove (if DnD enabled).
- Drag operations also reachable via keyboard: focus event, press Space to "pick up", arrow keys to move, Space again to drop, Escape to cancel.
- All themes meet WCAG AA contrast. `high-contrast` targets AAA.

---

## 11. Milestones

Each milestone ends with green CI, a tagged commit, and (from M2 onward) a working demo image pushed to izopi4a's registry.

| M | Scope | Examples added | Done means |
|---|---|---|---|
| **M1** | Repo scaffold (library + examples site skeleton, CI, Dockerfile, registry push workflow) | `examples/index.html` landing page (empty list) | `npm install && npm test && npm run build` works. `npm run dev:examples` serves the (empty) site. CI builds and pushes a tagged Docker image to izopi4a's registry. |
| **M2** | Month view, static | `month-basic`, `month-themes` | Renders a month with fixture events. Theme switching works. Both demos in the deployed image. |
| **M3** | Calendar API + EventStore | `imperative-api` | `addEvent` / `updateEvent` / `removeEvent` / navigation. Listeners fire. |
| **M4** | DnD on month view | `dnd` | Move + resize on month view. Keyboard equivalent. |
| **M5** | Resource Time Grid view + DnD | `rtg-worker-scheduling`, `rtg-many-resources` | Renders, supports same API, DnD across resources + time. |
| **M6** | CRUD adapter | `crud-url-shorthand`, `crud-function-form` | URL shorthand + function form, optimistic updates, rollback on error. |
| **M7** | v0.1.0 publish | (polish pass on all demos) | README written, examples site polished, npm publish under `@izopi4a/rostercal`. |
| later | React wrapper repo | Separate. |
| later | Vue wrapper repo | Separate. |

---

## 12. Decisions log

- **License:** MIT. *(2026-05-13)*
- **Browser support:** last 3 versions of Chrome/Edge/Firefox. Safari best-effort untested. No IE. *(2026-05-13)*
- **Recurring events:** never. Hard non-goal. *(2026-05-13)*
- **Coverage threshold:** collected, not gated. Revisit later. *(2026-05-13)*
- **RTG all-day row:** dropped from v0. Resource Time Grid is timed-only. *(2026-05-13)*
- **Examples site:** `examples/` folder, built with Vite, packaged as a Docker image and self-hosted by izopi4a on his own VM/domain. CI pushes the image to his private registry. No GitHub Pages. Vite is a dev-only dep, never shipped to consumers. *(2026-05-13)*
- **Package name:** `@izopi4a/rostercal`. "Roster" matches the worker-scheduling use case (duty roster / shift roster / crew roster). Public event type is `RosterEvent`. CSS scope is `.rostercal`, tokens prefixed `--rc-*`, data attributes `data-rostercal-*`. *(2026-05-13)*
