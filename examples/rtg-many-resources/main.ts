import { Calendar } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const root = document.getElementById("cal");
if (!root) throw new Error("missing #cal");

const cal = new Calendar(root, {
  view: "resource-time-grid",
  date: new Date(2026, 4, 13),
  resources: Array.from({ length: 8 }, (_, i) => ({
    id: `r${i + 1}`,
    title: `Room ${String.fromCharCode(65 + i)}`,
  })),
  events: [
    // Room A — three mutually overlapping.
    {
      id: "1",
      title: "Standup",
      resourceId: "r1",
      start: "2026-05-13T09:00",
      end: "2026-05-13T10:30",
    },
    {
      id: "2",
      title: "Onboarding",
      resourceId: "r1",
      start: "2026-05-13T09:30",
      end: "2026-05-13T11:00",
    },
    {
      id: "3",
      title: "Demo",
      resourceId: "r1",
      start: "2026-05-13T10:00",
      end: "2026-05-13T11:30",
    },
    // Room B — back-to-back.
    { id: "4", title: "1:1", resourceId: "r2", start: "2026-05-13T09:00", end: "2026-05-13T10:00" },
    { id: "5", title: "1:1", resourceId: "r2", start: "2026-05-13T10:00", end: "2026-05-13T11:00" },
    {
      id: "6",
      title: "Sync",
      resourceId: "r2",
      start: "2026-05-13T13:00",
      end: "2026-05-13T14:00",
    },
    // Room C — single long event.
    {
      id: "7",
      title: "Workshop",
      resourceId: "r3",
      start: "2026-05-13T09:00",
      end: "2026-05-13T17:00",
    },
    // Room D — pair of overlapping.
    {
      id: "8",
      title: "Interview",
      resourceId: "r4",
      start: "2026-05-13T11:00",
      end: "2026-05-13T12:00",
    },
    {
      id: "9",
      title: "Interview",
      resourceId: "r4",
      start: "2026-05-13T11:30",
      end: "2026-05-13T12:30",
    },
    // Room E — spread out.
    {
      id: "10",
      title: "Planning",
      resourceId: "r5",
      start: "2026-05-13T09:00",
      end: "2026-05-13T10:00",
    },
    {
      id: "11",
      title: "Retro",
      resourceId: "r5",
      start: "2026-05-13T15:00",
      end: "2026-05-13T16:00",
    },
    // Room F.
    {
      id: "12",
      title: "Customer call",
      resourceId: "r6",
      start: "2026-05-13T10:30",
      end: "2026-05-13T11:30",
    },
    {
      id: "13",
      title: "Customer call",
      resourceId: "r6",
      start: "2026-05-13T14:00",
      end: "2026-05-13T15:00",
    },
    // Room G.
    {
      id: "14",
      title: "Lunch reserved",
      resourceId: "r7",
      start: "2026-05-13T12:00",
      end: "2026-05-13T13:30",
    },
    // Room H.
    {
      id: "15",
      title: "Vendor mtg",
      resourceId: "r8",
      start: "2026-05-13T13:00",
      end: "2026-05-13T14:30",
    },
    {
      id: "16",
      title: "Vendor mtg",
      resourceId: "r8",
      start: "2026-05-13T13:30",
      end: "2026-05-13T15:00",
    },
  ],
});

cal.render();
