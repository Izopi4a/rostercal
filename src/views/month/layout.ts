import { addDays, daySpan, isSameDay, startOfDay, toDate } from "../../core/dates.js";
import type { RosterEvent } from "../../core/types.js";

/**
 * One contiguous span of an event within a single week row of the month grid.
 * Multi-day events are clipped to week boundaries — a Sun→Wed event in one
 * week and a Mon→Tue continuation in the next produce two MonthSegments.
 */
export interface MonthSegment {
  event: RosterEvent;
  startCol: number; // 0..6 within the week row
  span: number; // 1..7 columns
  lane: number; // vertical lane index within the week row
  continuesLeft: boolean; // event started in a previous week
  continuesRight: boolean; // event continues into the next week
}

export interface MonthWeekLayout {
  weekStart: Date;
  segments: MonthSegment[];
  /** Per-cell overflow count: how many additional non-displayed events the cell has, by column 0..6. */
  overflow: number[];
}

export interface MonthLayoutInput {
  events: RosterEvent[];
  gridStart: Date; // first cell of the 6×7 grid (may be in previous month)
  /** Maximum lanes (rows of events) visible inside each day cell before overflow kicks in. */
  maxLanesPerCell: number;
}

interface NormalizedEvent {
  event: RosterEvent;
  start: Date; // start-of-day
  end: Date; // start-of-day, inclusive
  isMultiDay: boolean;
}

function normalize(events: RosterEvent[]): NormalizedEvent[] {
  return events.map((event) => {
    const start = startOfDay(toDate(event.start));
    const end = event.end ? startOfDay(toDate(event.end)) : start;
    return {
      event,
      start,
      end,
      isMultiDay: !isSameDay(start, end) || event.allDay === true,
    };
  });
}

/**
 * Lays out events for the 6-week month grid.
 *
 * Algorithm per week row:
 *   1. Find events that intersect the week (allDay + multi-day → bars).
 *   2. Place each bar into the first lane where it fits without overlap.
 *   3. Single-day timed events are placed as 1-col-wide segments in their own day.
 *   4. If a day has more events than fit in `maxLanesPerCell`, the excess becomes overflow.
 */
export function layoutMonth(input: MonthLayoutInput): MonthWeekLayout[] {
  const { events, gridStart, maxLanesPerCell } = input;
  const normalized = normalize(events);
  const weeks: MonthWeekLayout[] = [];

  for (let w = 0; w < 6; w++) {
    const weekStart = addDays(gridStart, w * 7);
    const weekEnd = addDays(weekStart, 6);
    const overflow = [0, 0, 0, 0, 0, 0, 0];

    // Collect events that intersect this week.
    const intersecting = normalized.filter((e) => e.start <= weekEnd && e.end >= weekStart);

    // Sort: multi-day first (so bars get top lanes), then by start date, then start time within day.
    intersecting.sort((a, b) => {
      if (a.isMultiDay !== b.isMultiDay) return a.isMultiDay ? -1 : 1;
      const dayDiff = a.start.getTime() - b.start.getTime();
      if (dayDiff !== 0) return dayDiff;
      return toDate(a.event.start).getTime() - toDate(b.event.start).getTime();
    });

    const lanes: boolean[][] = []; // lanes[laneIdx][col] = occupied
    const segments: MonthSegment[] = [];

    for (const e of intersecting) {
      const segStart = e.start < weekStart ? weekStart : e.start;
      const segEnd = e.end > weekEnd ? weekEnd : e.end;
      const startCol = daySpan(weekStart, segStart) - 1;
      const span = daySpan(segStart, segEnd);

      // Find first lane where all needed columns are free.
      let laneIdx = 0;
      for (;;) {
        const lane = lanes[laneIdx] ?? Array(7).fill(false);
        let fits = true;
        for (let c = startCol; c < startCol + span; c++) {
          if (lane[c]) {
            fits = false;
            break;
          }
        }
        if (fits) {
          // Reserve.
          for (let c = startCol; c < startCol + span; c++) lane[c] = true;
          lanes[laneIdx] = lane;
          break;
        }
        laneIdx++;
      }

      if (laneIdx < maxLanesPerCell) {
        segments.push({
          event: e.event,
          startCol,
          span,
          lane: laneIdx,
          continuesLeft: e.start < weekStart,
          continuesRight: e.end > weekEnd,
        });
      } else {
        // Exceeded visible lanes — bump overflow for each column the segment would have occupied.
        for (let c = startCol; c < startCol + span; c++) {
          overflow[c] = (overflow[c] ?? 0) + 1;
        }
      }
    }

    weeks.push({ weekStart, segments, overflow });
  }

  return weeks;
}
