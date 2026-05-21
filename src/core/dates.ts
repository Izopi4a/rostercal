export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MS_PER_DAY = 86_400_000;

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function startOfMonth(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(1);
  return r;
}

/** Returns the date for the first cell of the month-view grid (may be in the previous month). */
export function monthGridStart(focusDate: Date, firstDayOfWeek: WeekStart): Date {
  const first = startOfMonth(focusDate);
  const offset = (first.getDay() - firstDayOfWeek + 7) % 7;
  return addDays(first, -offset);
}

/** Returns 42 sequential dates (6 weeks × 7 days) for the month view of `focusDate`. */
export function monthGridCells(focusDate: Date, firstDayOfWeek: WeekStart): Date[] {
  const start = monthGridStart(focusDate, firstDayOfWeek);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
  return cells;
}

/** Returns the localized weekday short names in the order dictated by `firstDayOfWeek`. */
export function weekdayShortNames(locale: string, firstDayOfWeek: WeekStart): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 2026-01-04 is a Sunday (day index 0) — convenient reference week.
  const sunday = new Date(2026, 0, 4);
  const names: string[] = [];
  for (let i = 0; i < 7; i++) {
    names.push(fmt.format(addDays(sunday, (i + firstDayOfWeek) % 7)));
  }
  return names;
}

export function monthYearLabel(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

export function formatTime(
  date: Date,
  locale: string,
  hour12?: boolean,
  tz?: "local" | "UTC",
): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (hour12 !== undefined) opts.hour12 = hour12;
  if (tz === "UTC") opts.timeZone = "UTC";
  return new Intl.DateTimeFormat(locale, opts).format(date);
}

/** Parse a Date or ISO string into a Date. Throws on invalid input. */
export function toDate(value: Date | string): Date {
  const d = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Invalid date value: ${String(value)}`);
  }
  return d;
}

/** Inclusive day-count between two dates (ignores time-of-day). */
export function daySpan(start: Date, end: Date): number {
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / MS_PER_DAY) + 1;
}

/** Minutes since 00:00 of the date's local day. */
export function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Sets the time-of-day of `d` to `00:00 + minutes` (local). Returns a new Date. */
export function setMinuteOfDay(d: Date, minutes: number): Date {
  const r = startOfDay(d);
  r.setMinutes(minutes);
  return r;
}

/** Returns localized hour labels (00..23) for the resource time grid axis. */
export function hourLabels(locale: string, hour12?: boolean, tz?: "local" | "UTC"): string[] {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric" };
  if (hour12 !== undefined) opts.hour12 = hour12;
  if (tz === "UTC") opts.timeZone = "UTC";
  const fmt = new Intl.DateTimeFormat(locale, opts);
  const out: string[] = [];
  if (tz === "UTC") {
    for (let h = 0; h < 24; h++) {
      out.push(fmt.format(new Date(Date.UTC(2026, 0, 1, h, 0, 0))));
    }
  } else {
    const ref = new Date(2026, 0, 1);
    for (let h = 0; h < 24; h++) {
      ref.setHours(h, 0, 0, 0);
      out.push(fmt.format(ref));
    }
  }
  return out;
}

/** Minutes since 00:00 in the given timezone. */
export function minuteOfDayTz(d: Date, tz: "local" | "UTC"): number {
  return tz === "UTC" ? d.getUTCHours() * 60 + d.getUTCMinutes() : minuteOfDay(d);
}

/** Midnight of `d`'s calendar day in the given timezone. */
export function startOfDayTz(d: Date, tz: "local" | "UTC"): Date {
  if (tz === "UTC") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return startOfDay(d);
}

/** True when `a` and `b` fall on the same calendar day in the given timezone. */
export function isSameDayTz(a: Date, b: Date, tz: "local" | "UTC"): boolean {
  if (tz === "UTC") {
    return (
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate()
    );
  }
  return isSameDay(a, b);
}

/** Returns a new Date at `d`'s calendar midnight + `minutes` in the given timezone. */
export function setMinuteOfDayTz(d: Date, minutes: number, tz: "local" | "UTC"): Date {
  if (tz === "UTC") {
    const r = startOfDayTz(d, "UTC");
    r.setUTCMinutes(minutes);
    return r;
  }
  return setMinuteOfDay(d, minutes);
}

/**
 * Adds (or subtracts) `n` months from `d`. Clamps the day-of-month to the
 * target month's last day to avoid Jan 31 → Mar 3 spillover surprises.
 */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}
