import { Calendar } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const root = document.getElementById("cal");
const logElMaybe = document.getElementById("log");
if (!root || !logElMaybe) throw new Error("missing #cal or #log");
const logEl: HTMLElement = logElMaybe;

const cal = new Calendar(root, {
  date: new Date(2026, 4, 13),
  events: [
    { id: "seed-1", title: "Conference", start: "2026-05-12", end: "2026-05-13", allDay: true },
    { id: "seed-2", title: "Meeting", start: "2026-05-13T10:30" },
  ],
});
cal.render();

function log(msg: string) {
  const stamp = new Date().toLocaleTimeString();
  logEl.textContent = `[${stamp}] ${msg}\n${logEl.textContent ?? ""}`;
}

// Format a Date using its LOCAL components — toISOString() would shift it to UTC,
// which silently produces the wrong day for users in late-evening timezones.
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

cal.on("viewChange", ({ view, date }) => {
  log(`viewChange → view=${view}, date=${ymd(date)}`);
});
cal.on("eventClick", ({ event }) => {
  log(`eventClick → id=${event.id}, title=${event.title}`);
});
cal.on("dateClick", ({ date }) => {
  log(`dateClick → date=${ymd(date)}`);
});

const titles = ["Standup", "Review", "1:1", "Lunch", "Demo", "Planning", "Sync"];
let nextId = 1;
const addedIds: string[] = [];

document.getElementById("prev")?.addEventListener("click", () => cal.prev());
document.getElementById("next")?.addEventListener("click", () => cal.next());
document.getElementById("today")?.addEventListener("click", () => cal.today());

document.getElementById("add")?.addEventListener("click", () => {
  const visibleDate = cal.getDate();
  const day = 1 + Math.floor(Math.random() * 28);
  const hour = 8 + Math.floor(Math.random() * 10);
  const start = new Date(visibleDate.getFullYear(), visibleDate.getMonth(), day, hour, 0);
  const title = titles[Math.floor(Math.random() * titles.length)] ?? "Event";
  const id = `gen-${nextId++}`;
  cal.addEvent({ id, title, start: start.toISOString() });
  addedIds.push(id);
  log(`addEvent → id=${id}, title=${title}, day=${day}`);
});

document.getElementById("remove")?.addEventListener("click", () => {
  const id = addedIds.pop();
  if (!id) {
    log("nothing to remove (only seed events left)");
    return;
  }
  cal.removeEvent(id);
  log(`removeEvent → id=${id}`);
});

document.getElementById("clear")?.addEventListener("click", () => {
  logEl.textContent = "";
});
