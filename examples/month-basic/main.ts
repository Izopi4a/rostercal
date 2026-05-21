import { Calendar } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const root = document.getElementById("cal");
if (!root) throw new Error("missing #cal");

const cal = new Calendar(root, {
  date: new Date(2026, 4, 13),
  events: [
    { id: "1", title: "All Day Event", start: "2026-05-01", allDay: true },
    { id: "2", title: "Long Event", start: "2026-05-07", end: "2026-05-09", allDay: true },
    { id: "3", title: "Conference", start: "2026-05-12", end: "2026-05-13", allDay: true },
    { id: "4", title: "Meeting", start: "2026-05-13T10:30" },
    { id: "5", title: "Lunch", start: "2026-05-13T12:00" },
    { id: "6", title: "Meeting", start: "2026-05-13T14:30" },
    { id: "7", title: "Happy Hour", start: "2026-05-13T17:30" },
    { id: "8", title: "Dinner", start: "2026-05-13T19:00" },
    { id: "9", title: "Birthday Party", start: "2026-05-14T07:00" },
    { id: "10", title: "Repeating Event", start: "2026-05-09T16:00" },
    { id: "11", title: "Repeating Event", start: "2026-05-16T16:00" },
  ],
});

cal.render();
