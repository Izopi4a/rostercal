import type { WeekStart } from "../core/dates.js";
import type {
  BlockedRange,
  EventContentRenderer,
  Resource,
  RosterEvent,
  ViewName,
} from "../core/types.js";

export interface DropProposal {
  eventId: string;
  /** New start (replaces the event's existing start). */
  newStart: Date;
  /** New end. Omitted if the original event had no end. A move preserves end-status. */
  newEnd?: Date;
  /** New resource id, if the move crossed columns. Omit for same-resource moves. */
  newResourceId?: string;
}

export interface ResizeProposal {
  eventId: string;
  /** New end date. The event's start is unchanged. */
  newEnd: Date;
}

export interface ViewContext {
  date: Date;
  events: RosterEvent[];
  resources: Resource[];
  firstDayOfWeek: WeekStart;
  locale: string;
  maxEventsPerCell: number;
  slotMinutes: number;
  /** Inclusive minute-of-day for the start of the time-grid axis (e.g. 480 = 08:00). */
  slotMinMinute: number;
  /** Exclusive minute-of-day for the end of the time-grid axis (e.g. 1320 = 22:00). */
  slotMaxMinute: number;
  blockedRanges: BlockedRange[];
  allowDropOnBlocked: boolean;
  dnd: boolean;
  hour12: boolean | undefined;
  timezone: "local" | "UTC";
  onEventClick?: (event: RosterEvent, native: MouseEvent) => void;
  onDateClick?: (date: Date, resourceId?: string) => void;
  /** A view asks the calendar to apply a move. Calendar handles optimistic update + rollback. */
  onEventDrop?: (proposal: DropProposal) => Promise<void>;
  /** A view asks the calendar to apply a resize. */
  onEventResize?: (proposal: ResizeProposal) => Promise<void>;
  /** Called when an external HTML5-draggable is dropped onto the view. Calendar performs the blocked check. */
  onExternalDrop?: (date: Date, resourceId: string) => void;
  /** Replacement renderer for event inner content. */
  eventContent: EventContentRenderer | undefined;
  /** Render hook — called after each event element is built. */
  eventDidMount: ((info: { event: RosterEvent; el: HTMLElement }) => void) | undefined;
  /** Render hook — called for each RTG slot cell after it is built. */
  slotDidMount: ((info: { date: Date; resourceId: string; el: HTMLElement }) => void) | undefined;
}

export interface View {
  readonly name: ViewName;
  mount(container: HTMLElement, ctx: ViewContext): void;
  unmount(): void;
  update(ctx: ViewContext): void;
  getVisibleRange(): { from: Date; to: Date };
}
