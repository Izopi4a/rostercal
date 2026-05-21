import { Calendar, type RosterEvent } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const RESOURCES = [
  { id: "alex", title: "Alex" },
  { id: "blair", title: "Blair" },
  { id: "casey", title: "Casey" },
];

const SERVICES = [
  "Haircut",
  "Color",
  "Trim",
  "Consult",
  "Cut + style",
  "Wash",
  "Color + cut",
  "Blowout",
  "Highlights",
  "Toner",
];
const DURATIONS = [30, 30, 60, 30, 60, 90, 30, 60];
// 30-min slots from 09:00 to 17:00
const SLOTS = Array.from({ length: 16 }, (_, i) => 9 * 60 + i * 30);

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function eventsForDate(date: Date): RosterEvent[] {
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const rand = rng(seed);
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const events: RosterEvent[] = [];
  let uid = 1;

  for (const resource of RESOURCES) {
    const count = 2 + Math.floor(rand() * 3);
    let cursor = Math.floor(rand() * 3);

    for (let i = 0; i < count; i++) {
      if (cursor >= SLOTS.length) break;
      const startMin = SLOTS[cursor];
      const duration = DURATIONS[Math.floor(rand() * DURATIONS.length)];
      if (startMin === undefined || duration === undefined) break;
      const endMin = startMin + duration;
      if (endMin > 17 * 60) break;

      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

      events.push({
        id: `${ymd}-${resource.id}-${uid++}`,
        title: SERVICES[Math.floor(rand() * SERVICES.length)] ?? "Appointment",
        resourceId: resource.id,
        start: `${ymd}T${fmt(startMin)}`,
        end: `${ymd}T${fmt(endMin)}`,
      });

      cursor += Math.ceil(duration / 30) + 1 + Math.floor(rand() * 2);
    }
  }

  return events;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// --- setup ---

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const root = getEl("cal");
const dateLabel = getEl("date-label");
let currentDate = new Date(2026, 4, 14);

let hour12: boolean | undefined; // undefined = follow locale default
let timezone: "local" | "UTC" = "local";
let cal: Calendar;

function rebuild(): void {
  cal?.destroy();
  cal = new Calendar(root, {
    view: "resource-time-grid",
    date: currentDate,
    resources: RESOURCES,
    events: eventsForDate(currentDate),
    ...(hour12 !== undefined ? { hour12 } : {}),
    timezone,
  });
  cal.render();
  cal.on("eventDrop", ({ event, oldStart }) => {
    console.log(
      `[demo] ${event.id} moved from ${oldStart.toLocaleString()} to ${new Date(event.start).toLocaleString()} on ${event.resourceId}`,
    );
  });
  cal.on("eventResize", ({ event, oldEnd }) => {
    const newEnd = event.end ? new Date(event.end) : null;
    console.log(`[demo] ${event.id} end ${oldEnd?.toLocaleString()} → ${newEnd?.toLocaleString()}`);
  });
}

rebuild();
dateLabel.textContent = formatDate(currentDate);

function navTo(date: Date): void {
  currentDate = date;
  for (const ev of cal.getEvents()) cal.removeEvent(ev.id);
  cal.setDate(date);
  for (const ev of eventsForDate(date)) cal.addEvent(ev);
  dateLabel.textContent = formatDate(date);
}

getEl("btn-prev").addEventListener("click", () => {
  const d = new Date(currentDate);
  d.setDate(d.getDate() - 1);
  navTo(d);
});

getEl("btn-next").addEventListener("click", () => {
  const d = new Date(currentDate);
  d.setDate(d.getDate() + 1);
  navTo(d);
});

getEl("btn-today").addEventListener("click", () => {
  navTo(new Date());
});

function setPressed(activeId: string, ...ids: string[]): void {
  for (const id of ids) {
    (getEl(id) as HTMLButtonElement).setAttribute("aria-pressed", String(id === activeId));
  }
}

getEl("btn-12h").addEventListener("click", () => {
  hour12 = true;
  setPressed("btn-12h", "btn-12h", "btn-24h");
  rebuild();
});

getEl("btn-24h").addEventListener("click", () => {
  hour12 = false;
  setPressed("btn-24h", "btn-12h", "btn-24h");
  rebuild();
});

getEl("btn-local").addEventListener("click", () => {
  timezone = "local";
  setPressed("btn-local", "btn-local", "btn-utc");
  rebuild();
});

getEl("btn-utc").addEventListener("click", () => {
  timezone = "UTC";
  setPressed("btn-utc", "btn-local", "btn-utc");
  rebuild();
});
