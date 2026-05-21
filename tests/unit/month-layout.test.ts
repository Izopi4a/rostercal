import { describe, expect, it } from "vitest";
import { monthGridStart } from "../../src/core/dates.js";
import type { RosterEvent } from "../../src/index.js";
import { layoutMonth } from "../../src/views/month/layout.js";

const FOCUS = new Date(2026, 4, 13); // May 2026
const GRID_START = monthGridStart(FOCUS, 0); // Sun Apr 26 2026

function ev(id: string, start: string, end?: string, allDay?: boolean): RosterEvent {
  return { id, title: id, start, ...(end ? { end } : {}), ...(allDay ? { allDay } : {}) };
}

describe("layoutMonth", () => {
  it("returns 6 weeks", () => {
    const weeks = layoutMonth({ events: [], gridStart: GRID_START, maxLanesPerCell: 3 });
    expect(weeks).toHaveLength(6);
  });

  it("places a single-day event in its day with span=1", () => {
    const e = ev("a", "2026-05-13T10:00");
    const weeks = layoutMonth({ events: [e], gridStart: GRID_START, maxLanesPerCell: 3 });
    const allSegments = weeks.flatMap((w) => w.segments);
    expect(allSegments).toHaveLength(1);
    expect(allSegments[0]?.span).toBe(1);
    expect(allSegments[0]?.continuesLeft).toBe(false);
    expect(allSegments[0]?.continuesRight).toBe(false);
  });

  it("spans a multi-day event across consecutive days within a week", () => {
    const e = ev("conf", "2026-05-12", "2026-05-13", true);
    const weeks = layoutMonth({ events: [e], gridStart: GRID_START, maxLanesPerCell: 3 });
    const seg = weeks.flatMap((w) => w.segments)[0];
    expect(seg?.span).toBe(2);
  });

  it("clips a multi-week event into one segment per week with continues flags", () => {
    // Thu May 7 → Sat May 9 spills only within one week, so use a longer event.
    // Use a Wed→next-Tue span instead (May 6 → May 12) to cross a week boundary.
    const e = ev("long", "2026-05-06", "2026-05-12", true);
    const weeks = layoutMonth({ events: [e], gridStart: GRID_START, maxLanesPerCell: 3 });
    const segs = weeks.flatMap((w) => w.segments);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.continuesRight).toBe(true);
    expect(segs[1]?.continuesLeft).toBe(true);
  });

  it("stacks overlapping single-day events into separate lanes", () => {
    const a = ev("a", "2026-05-13T10:00");
    const b = ev("b", "2026-05-13T11:00");
    const c = ev("c", "2026-05-13T12:00");
    const weeks = layoutMonth({ events: [a, b, c], gridStart: GRID_START, maxLanesPerCell: 3 });
    const segs = weeks.flatMap((w) => w.segments);
    const lanes = segs.map((s) => s.lane).sort();
    expect(lanes).toEqual([0, 1, 2]);
  });

  it("overflows when events exceed maxLanesPerCell", () => {
    const evts: RosterEvent[] = [];
    for (let i = 0; i < 5; i++) {
      evts.push(ev(`e${i}`, "2026-05-13T10:00"));
    }
    const weeks = layoutMonth({ events: evts, gridStart: GRID_START, maxLanesPerCell: 3 });
    const segs = weeks.flatMap((w) => w.segments);
    expect(segs).toHaveLength(3);
    const totalOverflow = weeks.reduce((sum, w) => sum + w.overflow.reduce((s, n) => s + n, 0), 0);
    expect(totalOverflow).toBe(2);
  });

  it("ignores events outside the grid range", () => {
    const e = ev("future", "2026-12-25T10:00");
    const weeks = layoutMonth({ events: [e], gridStart: GRID_START, maxLanesPerCell: 3 });
    expect(weeks.flatMap((w) => w.segments)).toHaveLength(0);
  });
});
