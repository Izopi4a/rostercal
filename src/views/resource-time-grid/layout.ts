import { isSameDayTz, minuteOfDayTz, toDate } from "../../core/dates.js";
import type { Resource, RosterEvent } from "../../core/types.js";

/**
 * One event positioned in the resource time grid.
 * Coordinates are in minutes (vertical) and lane index (horizontal within a resource column).
 */
export interface TimeGridSegment {
  event: RosterEvent;
  resourceId: string;
  startMinute: number; // 0..1440
  endMinute: number; // 1..1440
  lane: number; // 0..totalLanes-1
  totalLanes: number; // total lanes in this segment's overlap cluster
}

export interface TimeGridLayoutInput {
  events: RosterEvent[];
  resources: Resource[];
  day: Date;
  /** Used as the minimum visible duration for point events (no end). */
  slotMinutes: number;
  timezone?: "local" | "UTC";
}

interface NormalizedEvent {
  event: RosterEvent;
  startMinute: number;
  endMinute: number;
}

/**
 * Lays out resource-time-grid events per resource.
 *
 * Algorithm:
 *   1. For each resource, collect that resource's timed events on `day`.
 *   2. Sort by start time.
 *   3. Walk the sorted list grouping consecutive overlapping events into clusters.
 *   4. Within each cluster, greedily place events into the first lane whose
 *      latest end <= the event's start. Record the cluster's total lane count
 *      so columns can be split evenly across overlaps.
 *
 * Events with allDay=true are skipped (RTG is timed-only in v0 per the spec).
 * Events without a resourceId, or whose resourceId doesn't match any resource,
 * are skipped too.
 */
export function layoutResourceTimeGrid(input: TimeGridLayoutInput): TimeGridSegment[] {
  const { events, resources, day, slotMinutes, timezone = "local" } = input;
  const result: TimeGridSegment[] = [];

  for (const resource of resources) {
    const normalized: NormalizedEvent[] = [];
    for (const e of events) {
      if (e.resourceId !== resource.id) continue;
      if (e.allDay === true) continue;
      const start = toDate(e.start);
      const end = e.end ? toDate(e.end) : new Date(start.getTime() + slotMinutes * 60_000);
      if (!isSameDayTz(start, day, timezone)) continue;
      const startMinute = minuteOfDayTz(start, timezone);
      const endMinuteRaw = isSameDayTz(end, day, timezone) ? minuteOfDayTz(end, timezone) : 1440;
      const endMinute = Math.max(endMinuteRaw, startMinute + 1);
      normalized.push({ event: e, startMinute, endMinute });
    }

    normalized.sort((a, b) => a.startMinute - b.startMinute);

    // Cluster + lane assignment.
    let cluster: NormalizedEvent[] = [];
    let clusterEnd = -1;

    const flush = () => {
      if (!cluster.length) return;
      const lanes: number[] = []; // end-minute of last event in each lane
      const placements: Array<{ ev: NormalizedEvent; lane: number }> = [];
      for (const item of cluster) {
        let lane = lanes.findIndex((endM) => endM <= item.startMinute);
        if (lane === -1) {
          lane = lanes.length;
          lanes.push(0);
        }
        lanes[lane] = item.endMinute;
        placements.push({ ev: item, lane });
      }
      const totalLanes = lanes.length;
      for (const { ev, lane } of placements) {
        result.push({
          event: ev.event,
          resourceId: resource.id,
          startMinute: ev.startMinute,
          endMinute: ev.endMinute,
          lane,
          totalLanes,
        });
      }
      cluster = [];
    };

    for (const e of normalized) {
      if (e.startMinute >= clusterEnd) flush();
      cluster.push(e);
      clusterEnd = Math.max(clusterEnd, e.endMinute);
    }
    flush();
  }

  return result;
}
