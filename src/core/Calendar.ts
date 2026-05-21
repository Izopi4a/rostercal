import { CrudController } from "../data/CrudAdapter.js";
import { MonthView } from "../views/month/MonthView.js";
import { ResourceTimeGridView } from "../views/resource-time-grid/ResourceTimeGridView.js";
import type { DropProposal, ResizeProposal, View, ViewContext } from "../views/View.js";
import { addMonths, toDate, type WeekStart } from "./dates.js";
import { EventStore, ResourceStore } from "./EventStore.js";
import { type CalendarEventHandler, type CalendarEventName, Emitter } from "./events.js";
import type { CalendarOptions, Resource, RosterEvent, ViewName } from "./types.js";

interface ResolvedOptions {
  view: ViewName;
  date: Date;
  firstDayOfWeek: WeekStart;
  locale: string;
  theme: string;
  dnd: boolean;
  maxEventsPerCell: number;
  slotMinutes: number;
  hour12: boolean | undefined;
  timezone: "local" | "UTC";
  eventDidMount: ((info: { event: RosterEvent; el: HTMLElement }) => void) | undefined;
  slotDidMount: ((info: { date: Date; resourceId: string; el: HTMLElement }) => void) | undefined;
}

export class Calendar {
  private readonly root: HTMLElement;
  private options: ResolvedOptions;
  private events: EventStore;
  private resources: ResourceStore;
  private emitter = new Emitter();
  private view: View | null = null;
  private mounted = false;
  private crud: CrudController | null;

  constructor(root: HTMLElement, options: CalendarOptions = {}) {
    this.root = root;
    this.options = resolve(options);
    this.events = new EventStore(options.events ?? []);
    this.resources = new ResourceStore(options.resources ?? []);
    this.crud = options.data ? new CrudController(options.data) : null;
  }

  // --- lifecycle ---

  render(): void {
    this.root.classList.add("rostercal");
    this.root.dataset.rostercalTheme = this.options.theme;
    this.view = this.pickView(this.options.view);
    this.view.mount(this.root, this.buildContext());
    this.mounted = true;
    void this.emitter.emit("viewChange", { view: this.options.view, date: this.options.date });
    void this.loadFromAdapter();
  }

  destroy(): void {
    this.view?.unmount();
    this.view = null;
    this.root.replaceChildren();
    this.root.classList.remove("rostercal");
    delete this.root.dataset.rostercalTheme;
    this.mounted = false;
  }

  // --- events (the listener kind) ---

  on<K extends CalendarEventName>(name: K, handler: CalendarEventHandler<K>): () => void {
    return this.emitter.on(name, handler);
  }

  off<K extends CalendarEventName>(name: K, handler: CalendarEventHandler<K>): void {
    this.emitter.off(name, handler);
  }

  // --- event CRUD ---

  addEvent(event: RosterEvent): RosterEvent {
    const stored = this.events.add(event);
    this.refresh();
    if (this.crud?.hasCreate()) void this.persistCreate(stored);
    return stored;
  }

  updateEvent(id: string, patch: Partial<RosterEvent>): RosterEvent {
    const before = this.events.get(id);
    const updated = this.events.update(id, patch);
    this.refresh();
    if (this.crud?.hasUpdate() && before) void this.persistUpdate(updated, before);
    return updated;
  }

  removeEvent(id: string): void {
    const removed = this.events.get(id);
    this.events.remove(id);
    this.refresh();
    if (this.crud?.hasDelete() && removed) void this.persistDelete(removed);
  }

  getEvent(id: string): RosterEvent | undefined {
    return this.events.get(id);
  }

  getEvents(): RosterEvent[] {
    return this.events.list();
  }

  // --- resources ---

  addResource(resource: Resource): Resource {
    const stored = this.resources.add(resource);
    this.refresh();
    return stored;
  }

  removeResource(id: string): void {
    this.resources.remove(id);
    this.refresh();
  }

  getResources(): Resource[] {
    return this.resources.list();
  }

  // --- navigation / view ---

  setView(view: ViewName): void {
    if (view === this.options.view) return;
    this.options.view = view;
    if (this.mounted) {
      this.view?.unmount();
      this.view = this.pickView(view);
      this.view.mount(this.root, this.buildContext());
      void this.emitter.emit("viewChange", { view, date: this.options.date });
    }
  }

  setDate(date: Date): void {
    this.options.date = date;
    this.refresh();
    void this.emitter.emit("viewChange", { view: this.options.view, date });
    void this.loadFromAdapter();
  }

  next(): void {
    this.setDate(this.stepDate(1));
  }

  prev(): void {
    this.setDate(this.stepDate(-1));
  }

  today(): void {
    this.setDate(new Date());
  }

  setTheme(theme: string): void {
    this.options.theme = theme;
    this.root.dataset.rostercalTheme = theme;
  }

  getView(): ViewName {
    return this.options.view;
  }

  getDate(): Date {
    return new Date(this.options.date);
  }

  // --- internals ---

  private stepDate(direction: 1 | -1): Date {
    if (this.options.view === "month") return addMonths(this.options.date, direction);
    // resource-time-grid (when implemented) steps by 1 day.
    const next = new Date(this.options.date);
    next.setDate(next.getDate() + direction);
    return next;
  }

  private pickView(view: ViewName): View {
    switch (view) {
      case "month":
        return new MonthView();
      case "resource-time-grid":
        return new ResourceTimeGridView();
    }
  }

  private buildContext(): ViewContext {
    return {
      date: this.options.date,
      events: this.events.list(),
      resources: this.resources.list(),
      firstDayOfWeek: this.options.firstDayOfWeek,
      locale: this.options.locale,
      maxEventsPerCell: this.options.maxEventsPerCell,
      slotMinutes: this.options.slotMinutes,
      dnd: this.options.dnd,
      hour12: this.options.hour12,
      timezone: this.options.timezone,
      onEventClick: (event, native) => {
        void this.emitter.emit("eventClick", { event, native });
      },
      onDateClick: (date, resourceId) => {
        void this.emitter.emit("dateClick", { date, ...(resourceId ? { resourceId } : {}) });
      },
      onEventDrop: (proposal) => this.applyDrop(proposal),
      onEventResize: (proposal) => this.applyResize(proposal),
      onExternalDrop: (date, resourceId) => {
        void this.emitter.emit("externalDrop", { date, resourceId });
      },
      eventDidMount: this.options.eventDidMount,
      slotDidMount: this.options.slotDidMount,
    };
  }

  /**
   * Apply a move proposal optimistically, emit eventDrop, and roll back on
   * handler rejection. The handler payload carries the OLD start/end so users
   * can detect what to compare against — and reject (throw / return a rejected
   * promise) to cancel the move.
   *
   * A move preserves the event's "has end" status: if the original event has
   * an end, the proposal MUST supply newEnd. If not, newEnd is omitted on both
   * the proposal and the patch.
   */
  private async applyDrop(proposal: DropProposal): Promise<void> {
    const current = this.events.get(proposal.eventId);
    if (!current) return;
    const oldStart = toDate(current.start);
    const oldEnd = current.end ? toDate(current.end) : undefined;

    const oldResourceId = current.resourceId;
    const patch: Partial<RosterEvent> = { start: proposal.newStart };
    if (proposal.newEnd !== undefined) patch.end = proposal.newEnd;
    if (proposal.newResourceId !== undefined) patch.resourceId = proposal.newResourceId;
    const updated = this.events.update(proposal.eventId, patch);
    this.refresh();

    try {
      await this.emitter.emit("eventDrop", {
        event: updated,
        oldStart,
        ...(oldEnd ? { oldEnd } : {}),
      });
    } catch (_err) {
      const rollback: Partial<RosterEvent> = { start: oldStart };
      if (oldEnd !== undefined) rollback.end = oldEnd;
      if (oldResourceId !== undefined) rollback.resourceId = oldResourceId;
      this.events.update(proposal.eventId, rollback);
      this.refresh();
      return;
    }

    // Listener accepted — persist via CRUD adapter if configured.
    if (this.crud?.hasUpdate()) await this.persistUpdate(updated, current);
  }

  private async applyResize(proposal: ResizeProposal): Promise<void> {
    const current = this.events.get(proposal.eventId);
    if (!current) return;
    const oldStart = toDate(current.start);
    const oldEnd = current.end ? toDate(current.end) : undefined;

    const updated = this.events.update(proposal.eventId, { end: proposal.newEnd });
    this.refresh();

    try {
      await this.emitter.emit("eventResize", {
        event: updated,
        oldStart,
        ...(oldEnd ? { oldEnd } : {}),
      });
    } catch (_err) {
      // For resize, the event already had an end (we required it to resize).
      if (oldEnd !== undefined) {
        this.events.update(proposal.eventId, { end: oldEnd });
        this.refresh();
      }
      return;
    }

    if (this.crud?.hasUpdate()) await this.persistUpdate(updated, current);
  }

  private refresh(): void {
    if (this.mounted && this.view) this.view.update(this.buildContext());
  }

  // --- CRUD adapter integration ---

  private async loadFromAdapter(): Promise<void> {
    if (!this.crud?.hasList() || !this.view) return;
    try {
      const range = this.view.getVisibleRange();
      const list = await this.crud.list(range);
      this.events = new EventStore(list);
      this.refresh();
    } catch (err) {
      void this.emitter.emit("dataError", { op: "list", error: err });
    }
  }

  /**
   * Optimistic create: the event is already in the local store when this runs.
   * On rejection, remove it back out and emit dataError.
   */
  private async persistCreate(event: RosterEvent): Promise<void> {
    if (!this.crud) return;
    try {
      await this.crud.create(event);
    } catch (err) {
      if (this.events.get(event.id)) {
        this.events.remove(event.id);
        this.refresh();
      }
      void this.emitter.emit("dataError", { op: "create", error: err });
    }
  }

  /**
   * Optimistic update: the event is already updated locally. On rejection, put
   * the previous version back and emit dataError.
   */
  private async persistUpdate(after: RosterEvent, before: RosterEvent): Promise<void> {
    if (!this.crud) return;
    try {
      await this.crud.update(after);
    } catch (err) {
      // Restore the entire previous event (best-effort: only properties present on `before`).
      if (this.events.get(after.id)) {
        this.events.update(after.id, before);
        this.refresh();
      }
      void this.emitter.emit("dataError", { op: "update", error: err });
    }
  }

  /**
   * Optimistic delete: the event is already gone locally. On rejection, put it
   * back and emit dataError.
   */
  private async persistDelete(removed: RosterEvent): Promise<void> {
    if (!this.crud) return;
    try {
      await this.crud.delete(removed.id);
    } catch (err) {
      if (!this.events.get(removed.id)) {
        this.events.add(removed);
        this.refresh();
      }
      void this.emitter.emit("dataError", { op: "delete", error: err });
    }
  }
}

function resolve(opts: CalendarOptions): ResolvedOptions {
  return {
    view: opts.view ?? "month",
    date: opts.date ?? new Date(),
    firstDayOfWeek: opts.firstDayOfWeek ?? 0,
    locale: opts.locale ?? "en-US",
    theme: opts.theme ?? "light",
    dnd: opts.dnd ?? true,
    maxEventsPerCell: 3,
    slotMinutes: opts.slotMinutes ?? 30,
    hour12: opts.hour12,
    timezone: opts.timezone ?? "local",
    eventDidMount: opts.eventDidMount,
    slotDidMount: opts.slotDidMount,
  };
}
