import { Calendar } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const root = document.getElementById("cal");
const logElMaybe = document.getElementById("log");
const reject = document.getElementById("reject") as HTMLInputElement | null;
if (!root || !logElMaybe || !reject) throw new Error("missing required elements");
const logEl: HTMLElement = logElMaybe;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function log(msg: string) {
  const stamp = new Date().toLocaleTimeString();
  logEl.textContent = `[${stamp}] ${msg}\n${logEl.textContent ?? ""}`;
}

const cal = new Calendar(root, {
  date: new Date(2026, 4, 13),
  events: [
    { id: "e1", title: "Conference", start: "2026-05-12", end: "2026-05-13", allDay: true },
    { id: "e2", title: "Meeting", start: "2026-05-13T10:30" },
    { id: "e3", title: "Lunch", start: "2026-05-13T12:00" },
    { id: "e4", title: "Long Event", start: "2026-05-07", end: "2026-05-09", allDay: true },
    { id: "e5", title: "Birthday Party", start: "2026-05-14T07:00" },
  ],
});
cal.render();

cal.on("eventDrop", async ({ event, oldStart }) => {
  log(`eventDrop → ${event.id} moved from ${ymd(oldStart)} to ${ymd(new Date(event.start))}`);
  if (reject.checked) {
    log("  ↳ handler rejecting → rolling back");
    throw new Error("rejected for demo");
  }
});

cal.on("eventResize", async ({ event, oldEnd }) => {
  const newEnd = event.end ? new Date(event.end) : new Date(event.start);
  const from = oldEnd ? ymd(oldEnd) : "(none)";
  log(`eventResize → ${event.id} end ${from} → ${ymd(newEnd)}`);
  if (reject.checked) {
    log("  ↳ handler rejecting → rolling back");
    throw new Error("rejected for demo");
  }
});
