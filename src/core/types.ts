export type ViewName = "month" | "resource-time-grid";

export interface RosterEvent {
  id: string;
  title: string;
  start: Date | string;
  end?: Date | string;
  allDay?: boolean;
  resourceId?: string;
  color?: string;
  extendedProps?: Record<string, unknown>;
}

export interface Resource {
  id: string;
  title: string;
  order?: number;
}

/**
 * A non-droppable time window on a single resource column. Rendered behind
 * events with a striped background. Drops onto a blocked range are rejected
 * (and emit `dropRejected`) unless `allowDropOnBlocked: true` is set.
 *
 * Resource-time-grid only. Ignored by the month view.
 */
export interface BlockedRange {
  resourceId: string;
  start: Date | string;
  end: Date | string;
}

export type OpString = `${"GET" | "POST" | "PATCH" | "PUT" | "DELETE"} ${string}`;

export interface CrudAdapter {
  list?: OpString | ((range: { from: Date; to: Date }) => Promise<unknown>);
  create?: OpString | ((event: RosterEvent) => Promise<unknown>);
  update?: OpString | ((event: RosterEvent) => Promise<unknown>);
  delete?: OpString | ((id: string) => Promise<unknown>);
  fromServer?: (raw: unknown) => RosterEvent | RosterEvent[];
  toServer?: (event: RosterEvent) => unknown;
  fetcher?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}

/**
 * Replacement renderer for an event's inner content. When supplied, the return
 * value replaces the default time + title body. `eventDidMount` still fires
 * afterwards on the wrapper element, so it remains a valid escape hatch.
 *
 * A returned string is inserted as text (never as HTML — pass a
 * `DocumentFragment` if you need markup).
 */
export type EventContentRenderer = (info: {
  event: RosterEvent;
}) => HTMLElement | DocumentFragment | string;

export interface CalendarOptions {
  view?: ViewName;
  date?: Date;
  firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  locale?: string;
  theme?: string;
  events?: RosterEvent[];
  resources?: Resource[];
  data?: CrudAdapter;
  dnd?: boolean;
  /** Minutes per time-grid slot. Default 30. Used by resource-time-grid view. */
  slotMinutes?: number;
  /**
   * Earliest time-of-day shown by the resource-time-grid axis, as `"HH:MM"`.
   * Inclusive. Default `"00:00"`. Must align to `slotMinutes`.
   */
  slotMinTime?: string;
  /**
   * Latest time-of-day shown by the resource-time-grid axis, as `"HH:MM"`.
   * Exclusive. Default `"24:00"`. Must be greater than `slotMinTime` and
   * align to `slotMinutes`.
   */
  slotMaxTime?: string;
  /**
   * Resource-time-grid only. Time ranges that cannot be dropped into.
   * See {@link BlockedRange}.
   */
  blockedRanges?: BlockedRange[];
  /**
   * If true, drops onto a blocked range are allowed and behave like normal
   * drops. Default false. Useful for admin UIs that may schedule outside
   * working hours.
   */
  allowDropOnBlocked?: boolean;
  /** Force 12 or 24-hour clock. Undefined = follow locale default. */
  hour12?: boolean;
  /** Which clock to use for positioning and labelling. Default "local". */
  timezone?: "local" | "UTC";
  /**
   * Replace the inner body of every event with custom content. Called once per
   * event during render. See {@link EventContentRenderer}.
   */
  eventContent?: EventContentRenderer;
  /**
   * Called after each event element is fully built and inserted into the DOM.
   * Use it to add custom badges, icons, or event listeners to the element.
   *
   * Fires *after* `eventContent` so it remains an escape hatch when the
   * structured renderer isn't enough.
   */
  eventDidMount?: (info: { event: RosterEvent; el: HTMLElement }) => void;
  /**
   * Resource Time Grid only. Called for each empty time-slot cell after it is
   * inserted. Use it to inject controls — e.g. a "+" button to create
   * appointments. The built-in class `rc-rtg__slot-add` gives you a themed
   * add-button that appears on hover at no extra CSS cost.
   */
  slotDidMount?: (info: { date: Date; resourceId: string; el: HTMLElement }) => void;
}
