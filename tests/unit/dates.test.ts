import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daySpan,
  hourLabels,
  isSameDay,
  isSameMonth,
  minuteOfDay,
  monthGridCells,
  monthGridStart,
  monthYearLabel,
  setMinuteOfDay,
  startOfDay,
  startOfMonth,
  toDate,
  weekdayShortNames,
} from "../../src/core/dates.js";

describe("startOfDay", () => {
  it("zeroes the time component", () => {
    const d = new Date(2026, 4, 13, 14, 23, 45, 678);
    const s = startOfDay(d);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    expect(s.getMilliseconds()).toBe(0);
    expect(s.getDate()).toBe(13);
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays(new Date(2026, 4, 13), 3).getDate()).toBe(16);
  });
  it("subtracts with negative days", () => {
    expect(addDays(new Date(2026, 4, 1), -1).getMonth()).toBe(3);
  });
  it("crosses month boundary", () => {
    const d = addDays(new Date(2026, 4, 30), 5);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(4);
  });
});

describe("isSameDay / isSameMonth", () => {
  it("compares days ignoring time", () => {
    expect(isSameDay(new Date(2026, 4, 13, 9), new Date(2026, 4, 13, 21))).toBe(true);
    expect(isSameDay(new Date(2026, 4, 13), new Date(2026, 4, 14))).toBe(false);
  });
  it("compares months ignoring day and time", () => {
    expect(isSameMonth(new Date(2026, 4, 1), new Date(2026, 4, 31))).toBe(true);
    expect(isSameMonth(new Date(2026, 4, 31), new Date(2026, 5, 1))).toBe(false);
  });
});

describe("monthGridStart", () => {
  it("returns the Sunday before May 1 2026 when firstDayOfWeek=0", () => {
    // May 1 2026 is a Friday → grid starts April 26 (Sun).
    const start = monthGridStart(new Date(2026, 4, 13), 0);
    expect(start.getMonth()).toBe(3);
    expect(start.getDate()).toBe(26);
    expect(start.getDay()).toBe(0);
  });
  it("returns Monday before May 1 2026 when firstDayOfWeek=1", () => {
    // Grid starts April 27 (Mon).
    const start = monthGridStart(new Date(2026, 4, 13), 1);
    expect(start.getMonth()).toBe(3);
    expect(start.getDate()).toBe(27);
    expect(start.getDay()).toBe(1);
  });
});

describe("monthGridCells", () => {
  it("returns exactly 42 sequential dates", () => {
    const cells = monthGridCells(new Date(2026, 4, 13), 0);
    expect(cells).toHaveLength(42);
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1];
      const curr = cells[i];
      if (!prev || !curr) throw new Error("unreachable: cells length checked above");
      expect(curr.getTime() - prev.getTime()).toBe(86_400_000);
    }
  });
});

describe("startOfMonth", () => {
  it("returns the first day of the month at midnight", () => {
    const s = startOfMonth(new Date(2026, 4, 13, 14, 30));
    expect(s.getDate()).toBe(1);
    expect(s.getHours()).toBe(0);
  });
});

describe("weekdayShortNames", () => {
  it("returns 7 names starting from Sunday in en-US", () => {
    const names = weekdayShortNames("en-US", 0);
    expect(names).toHaveLength(7);
    expect(names[0]).toMatch(/^Sun/);
    expect(names[6]).toMatch(/^Sat/);
  });
  it("rotates when firstDayOfWeek=1", () => {
    const names = weekdayShortNames("en-US", 1);
    expect(names[0]).toMatch(/^Mon/);
    expect(names[6]).toMatch(/^Sun/);
  });
});

describe("monthYearLabel", () => {
  it("formats month + year in given locale", () => {
    const label = monthYearLabel(new Date(2026, 4, 13), "en-US");
    expect(label).toMatch(/May/);
    expect(label).toMatch(/2026/);
  });
});

describe("toDate", () => {
  it("accepts ISO strings", () => {
    expect(toDate("2026-05-13T14:00:00Z").getUTCDate()).toBe(13);
  });
  it("accepts Date instances", () => {
    const d = new Date(2026, 4, 13);
    expect(toDate(d).getTime()).toBe(d.getTime());
  });
  it("throws on invalid input", () => {
    expect(() => toDate("not a date")).toThrow(/Invalid date/);
  });
});

describe("addMonths", () => {
  it("adds months within the same year", () => {
    const d = addMonths(new Date(2026, 4, 13), 2);
    expect(d.getMonth()).toBe(6);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getDate()).toBe(13);
  });
  it("crosses year boundary forward", () => {
    const d = addMonths(new Date(2026, 11, 13), 1);
    expect(d.getMonth()).toBe(0);
    expect(d.getFullYear()).toBe(2027);
  });
  it("crosses year boundary backward", () => {
    const d = addMonths(new Date(2026, 0, 13), -1);
    expect(d.getMonth()).toBe(11);
    expect(d.getFullYear()).toBe(2025);
  });
  it("clamps day-of-month to target month's last day (Jan 31 + 1 → Feb 28)", () => {
    const d = addMonths(new Date(2026, 0, 31), 1);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
  });
});

describe("minuteOfDay / setMinuteOfDay", () => {
  it("minuteOfDay returns minutes since 00:00", () => {
    expect(minuteOfDay(new Date(2026, 4, 13, 0, 0))).toBe(0);
    expect(minuteOfDay(new Date(2026, 4, 13, 9, 30))).toBe(570);
    expect(minuteOfDay(new Date(2026, 4, 13, 23, 59))).toBe(1439);
  });
  it("setMinuteOfDay applies minutes from start-of-day", () => {
    const d = setMinuteOfDay(new Date(2026, 4, 13, 14, 30), 900);
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(13);
  });
});

describe("hourLabels", () => {
  it("returns 24 labels", () => {
    expect(hourLabels("en-US")).toHaveLength(24);
  });
});

describe("daySpan", () => {
  it("returns 1 for same-day", () => {
    expect(daySpan(new Date(2026, 4, 13, 9), new Date(2026, 4, 13, 17))).toBe(1);
  });
  it("counts inclusively across days", () => {
    expect(daySpan(new Date(2026, 4, 13), new Date(2026, 4, 15))).toBe(3);
  });
});
