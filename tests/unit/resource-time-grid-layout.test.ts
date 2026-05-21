import { describe, expect, it } from "vitest";
import type { Resource, RosterEvent } from "../../src/index.js";
import { layoutResourceTimeGrid } from "../../src/views/resource-time-grid/layout.js";

const DAY = new Date(2026, 4, 13);
const resources: Resource[] = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
];

function ev(id: string, resourceId: string, start: string, end?: string): RosterEvent {
  return { id, title: id, resourceId, start, ...(end ? { end } : {}) };
}

describe("layoutResourceTimeGrid", () => {
  it("places a single event with totalLanes=1, lane=0", () => {
    const segs = layoutResourceTimeGrid({
      events: [ev("e1", "a", "2026-05-13T09:00", "2026-05-13T10:00")],
      resources,
      day: DAY,
      slotMinutes: 30,
    });
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ lane: 0, totalLanes: 1, startMinute: 540, endMinute: 600 });
  });

  it("places two non-overlapping events on the same resource in lane 0 each", () => {
    const segs = layoutResourceTimeGrid({
      events: [
        ev("e1", "a", "2026-05-13T09:00", "2026-05-13T10:00"),
        ev("e2", "a", "2026-05-13T11:00", "2026-05-13T12:00"),
      ],
      resources,
      day: DAY,
      slotMinutes: 30,
    });
    expect(segs.map((s) => s.lane)).toEqual([0, 0]);
    expect(segs.map((s) => s.totalLanes)).toEqual([1, 1]);
  });

  it("splits column when two events overlap on the same resource", () => {
    const segs = layoutResourceTimeGrid({
      events: [
        ev("a", "a", "2026-05-13T09:00", "2026-05-13T11:00"),
        ev("b", "a", "2026-05-13T10:00", "2026-05-13T12:00"),
      ],
      resources,
      day: DAY,
      slotMinutes: 30,
    });
    expect(segs.map((s) => s.totalLanes)).toEqual([2, 2]);
    expect(segs.map((s) => s.lane).sort()).toEqual([0, 1]);
  });

  it("places three mutually overlapping events into 3 lanes", () => {
    const segs = layoutResourceTimeGrid({
      events: [
        ev("a", "a", "2026-05-13T09:00", "2026-05-13T11:00"),
        ev("b", "a", "2026-05-13T09:30", "2026-05-13T10:30"),
        ev("c", "a", "2026-05-13T10:00", "2026-05-13T11:30"),
      ],
      resources,
      day: DAY,
      slotMinutes: 30,
    });
    expect(segs.map((s) => s.totalLanes)).toEqual([3, 3, 3]);
  });

  it("two non-overlapping clusters get their own lane counts", () => {
    const segs = layoutResourceTimeGrid({
      events: [
        ev("a1", "a", "2026-05-13T09:00", "2026-05-13T10:00"),
        ev("a2", "a", "2026-05-13T09:30", "2026-05-13T10:30"),
        ev("b1", "a", "2026-05-13T14:00", "2026-05-13T15:00"),
      ],
      resources,
      day: DAY,
      slotMinutes: 30,
    });
    const byId = Object.fromEntries(segs.map((s) => [s.event.id, s]));
    expect(byId.a1?.totalLanes).toBe(2);
    expect(byId.a2?.totalLanes).toBe(2);
    expect(byId.b1?.totalLanes).toBe(1);
  });

  it("scopes overlap detection to each resource (column splits don't bleed)", () => {
    const segs = layoutResourceTimeGrid({
      events: [
        ev("a", "a", "2026-05-13T09:00", "2026-05-13T11:00"),
        ev("b", "b", "2026-05-13T10:00", "2026-05-13T12:00"),
      ],
      resources,
      day: DAY,
      slotMinutes: 30,
    });
    expect(segs.every((s) => s.totalLanes === 1)).toBe(true);
  });

  it("skips events on other days, with no resource, or all-day", () => {
    const segs = layoutResourceTimeGrid({
      events: [
        ev("off-day", "a", "2026-05-14T09:00", "2026-05-14T10:00"),
        ev("no-resource", "z", "2026-05-13T09:00", "2026-05-13T10:00"),
        { id: "all-day", title: "x", resourceId: "a", start: "2026-05-13", allDay: true },
      ],
      resources,
      day: DAY,
      slotMinutes: 30,
    });
    expect(segs).toHaveLength(0);
  });

  it("assigns slotMinutes worth of height to events without an end (point events)", () => {
    const segs = layoutResourceTimeGrid({
      events: [{ id: "p", title: "p", resourceId: "a", start: "2026-05-13T09:00" }],
      resources,
      day: DAY,
      slotMinutes: 30,
    });
    expect(segs[0]?.endMinute).toBe(570);
  });

  it("clips an event whose end falls on the next day to 24:00", () => {
    const segs = layoutResourceTimeGrid({
      events: [ev("late", "a", "2026-05-13T23:30", "2026-05-14T01:00")],
      resources,
      day: DAY,
      slotMinutes: 30,
    });
    expect(segs[0]?.endMinute).toBe(1440);
  });
});
