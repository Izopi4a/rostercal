import { type BlockedRange, Calendar, type RosterEvent } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const DAY = "2026-05-14";

const RESOURCES = [
  { id: "alex", title: "Alex" },
  { id: "blair", title: "Blair" },
  { id: "casey", title: "Casey" },
];

const EVENTS: RosterEvent[] = [
  {
    id: "1",
    title: "Haircut",
    resourceId: "alex",
    start: `${DAY}T09:00`,
    end: `${DAY}T09:45`,
    extendedProps: { priceFinal: 25 },
  },
  {
    id: "2",
    title: "Color",
    resourceId: "alex",
    start: `${DAY}T10:00`,
    end: `${DAY}T11:30`,
    extendedProps: { priceFinal: 80 },
  },
  {
    id: "3",
    title: "Consult",
    resourceId: "blair",
    start: `${DAY}T09:30`,
    end: `${DAY}T10:00`,
    extendedProps: { priceFinal: 15 },
  },
  {
    id: "4",
    title: "Highlights",
    resourceId: "blair",
    start: `${DAY}T14:00`,
    end: `${DAY}T16:00`,
    extendedProps: { priceFinal: 120 },
  },
  {
    id: "5",
    title: "Blowout",
    resourceId: "casey",
    start: `${DAY}T15:00`,
    end: `${DAY}T16:00`,
    extendedProps: { priceFinal: 35 },
  },
];

// Lunch break per worker.
const BLOCKED: BlockedRange[] = [
  { resourceId: "alex", start: `${DAY}T12:00`, end: `${DAY}T12:30` },
  { resourceId: "blair", start: `${DAY}T13:00`, end: `${DAY}T13:30` },
  { resourceId: "casey", start: `${DAY}T12:30`, end: `${DAY}T13:00` },
];

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const root = getEl("cal");
const logEl = getEl("log");
function log(line: string): void {
  logEl.textContent = `${new Date().toLocaleTimeString()} ${line}\n${logEl.textContent ?? ""}`;
}

let allow = false;

function build(): Calendar {
  const cal = new Calendar(root, {
    view: "resource-time-grid",
    date: new Date(2026, 4, 14),
    resources: RESOURCES,
    events: EVENTS,
    slotMinTime: "08:00",
    slotMaxTime: "18:00",
    slotMinutes: 30,
    blockedRanges: BLOCKED,
    allowDropOnBlocked: allow,
    eventContent: ({ event }) => {
      // Replace the default body with a structured chip layout.
      const wrap = document.createDocumentFragment();

      const titleRow = document.createElement("div");
      titleRow.className = "event-title-row";
      titleRow.textContent = event.title;

      const price = event.extendedProps?.priceFinal;
      if (typeof price === "number") {
        const chip = document.createElement("span");
        chip.className = "price-chip";
        chip.textContent = `${price} лв`;
        titleRow.appendChild(chip);
      }

      const time = document.createElement("div");
      time.style.fontSize = "0.65rem";
      time.style.opacity = "0.85";
      const start = new Date(event.start);
      const end = event.end ? new Date(event.end) : null;
      time.textContent = end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);

      wrap.appendChild(time);
      wrap.appendChild(titleRow);
      return wrap;
    },
  });

  cal.render();

  cal.on("eventDrop", ({ event }) => {
    log(
      `✓ moved ${event.id} → ${new Date(event.start).toLocaleTimeString()} on ${event.resourceId}`,
    );
  });
  cal.on("dropRejected", ({ reason, date, resourceId }) => {
    log(`✗ rejected (${reason}) ${resourceId} @ ${date.toLocaleTimeString()}`);
  });
  cal.on("externalDrop", ({ date, resourceId }) => {
    log(`+ external drop ${resourceId} @ ${date.toLocaleTimeString()}`);
  });

  return cal;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

let cal = build();

function setPressed(activeId: string, ...ids: string[]): void {
  for (const id of ids) {
    (getEl(id) as HTMLButtonElement).setAttribute("aria-pressed", String(id === activeId));
  }
}

getEl("btn-strict").addEventListener("click", () => {
  allow = false;
  setPressed("btn-strict", "btn-strict", "btn-allow");
  cal.destroy();
  cal = build();
});

getEl("btn-allow").addEventListener("click", () => {
  allow = true;
  setPressed("btn-allow", "btn-strict", "btn-allow");
  cal.destroy();
  cal = build();
});

getEl("btn-clear-log").addEventListener("click", () => {
  logEl.textContent = "";
});
