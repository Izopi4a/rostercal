import type { RosterEvent, ViewName } from "./types.js";

export interface CalendarEventPayloads {
  eventClick: { event: RosterEvent; native: MouseEvent };
  eventDrop: { event: RosterEvent; oldStart: Date; oldEnd?: Date };
  eventResize: { event: RosterEvent; oldStart: Date; oldEnd?: Date };
  dateClick: { date: Date; resourceId?: string };
  viewChange: { view: ViewName; date: Date };
  dataError: { op: "list" | "create" | "update" | "delete"; error: unknown };
  /** Fired when an external draggable is dropped onto the time grid. */
  externalDrop: { date: Date; resourceId: string };
  /**
   * Fired when a drop (`eventDrop` or `externalDrop`) is refused by the calendar
   * itself — for example, into a blocked range. The originating action is
   * rolled back and the underlying `eventDrop` / `externalDrop` does not fire.
   */
  dropRejected: {
    reason: "blocked";
    date: Date;
    resourceId: string;
  };
}

export type CalendarEventName = keyof CalendarEventPayloads;

export type CalendarEventHandler<K extends CalendarEventName> = (
  payload: CalendarEventPayloads[K],
) => void | Promise<void>;

export class Emitter {
  private handlers = new Map<CalendarEventName, Set<CalendarEventHandler<CalendarEventName>>>();

  on<K extends CalendarEventName>(name: K, handler: CalendarEventHandler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as CalendarEventHandler<CalendarEventName>);
    return () => {
      set?.delete(handler as CalendarEventHandler<CalendarEventName>);
    };
  }

  off<K extends CalendarEventName>(name: K, handler: CalendarEventHandler<K>): void {
    this.handlers.get(name)?.delete(handler as CalendarEventHandler<CalendarEventName>);
  }

  async emit<K extends CalendarEventName>(
    name: K,
    payload: CalendarEventPayloads[K],
  ): Promise<void> {
    const set = this.handlers.get(name);
    if (!set || set.size === 0) return;
    await Promise.all([...set].map((h) => h(payload as CalendarEventPayloads[CalendarEventName])));
  }
}
