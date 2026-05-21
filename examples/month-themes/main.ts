import { Calendar } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const root = document.getElementById("cal");
if (!root) throw new Error("missing #cal");

const cal = new Calendar(root, {
  date: new Date(2026, 4, 13),
  events: [
    { id: "1", title: "Conference", start: "2026-05-12", end: "2026-05-13", allDay: true },
    { id: "2", title: "Long Event", start: "2026-05-07", end: "2026-05-09", allDay: true },
    { id: "3", title: "Meeting", start: "2026-05-13T10:30" },
    { id: "4", title: "Lunch", start: "2026-05-13T12:00" },
    { id: "5", title: "Birthday Party", start: "2026-05-14T07:00" },
  ],
});
cal.render();

document.querySelectorAll<HTMLButtonElement>(".toolbar button[data-theme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const theme = btn.dataset.theme ?? "light";
    cal.setTheme(theme);
    document.querySelectorAll<HTMLButtonElement>(".toolbar button[data-theme]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === btn));
    });
  });
});
