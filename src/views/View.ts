import type { WeekStart } from "../core/dates.js";
import type { Resource, RosterEvent, ViewName } from "../core/types.js";

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
  dnd: boolean;
  hour12: boolean | undefined;
  timezone: "local" | "UTC";
  onEventClick?: (event: RosterEvent, native: MouseEvent) => void;
  onDateClick?: (date: Date, resourceId?: string) => void;
  /** A view asks the calendar to apply a move. Calendar handles optimistic update + rollback. */
  onEventDrop?: (proposal: DropProposal) => Promise<void>;
  /** A view asks the calendar to apply a resize. */
  onEventResize?: (proposal: ResizeProposal) => Promise<void>;
  /** Called when an external HTML5-draggable is dropped onto the view. */
  onExternalDrop?: (date: Date, resourceId: string) => void;
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
