import {
  addDays,
  daySpan,
  formatTime,
  isSameDay,
  isSameMonth,
  monthGridCells,
  monthGridStart,
  monthYearLabel,
  startOfDay,
  toDate,
  weekdayShortNames,
} from "../../core/dates.js";
import type { RosterEvent, ViewName } from "../../core/types.js";
import { hitTestDateCell, startDrag } from "../../dnd/DragController.js";
import type { View, ViewContext } from "../View.js";
import { layoutMonth, type MonthSegment } from "./layout.js";

type DragMode = "move" | "resize";

export class MonthView implements View {
  readonly name: ViewName = "month";
  private host: HTMLElement | null = null;
  private ctx: ViewContext | null = null;
  /** ymd of the day cell the pointer is currently hovering over while dragging. */
  private hoverDateYmd: string | null = null;
  /** Currently-keyboard-picked-up event id, or null. */
  private keyboardCarryId: string | null = null;
  /** Tentative day-offset applied to the keyboard-carried event. */
  private keyboardCarryDelta = 0;

  mount(container: HTMLElement, ctx: ViewContext): void {
    this.host = container;
    this.ctx = ctx;
    this.draw();
  }

  unmount(): void {
    if (this.host) this.host.replaceChildren();
    this.host = null;
    this.ctx = null;
    this.cancelKeyboardDrag();
  }

  update(ctx: ViewContext): void {
    this.ctx = ctx;
    this.draw();
  }

  getVisibleRange(): { from: Date; to: Date } {
    if (!this.ctx) throw new Error("MonthView is not mounted");
    const cells = monthGridCells(this.ctx.date, this.ctx.firstDayOfWeek);
    const from = cells[0];
    const to = cells[cells.length - 1];
    if (!from || !to) throw new Error("unreachable: monthGridCells always returns 42 dates");
    return { from, to };
  }

  private draw(): void {
    if (!this.host || !this.ctx) return;
    const { date, events, firstDayOfWeek, locale, maxEventsPerCell } = this.ctx;

    const root = el("div", "rc-month");

    const header = el("div", "rc-month__title");
    header.textContent = monthYearLabel(date, locale);
    root.appendChild(header);

    const weekdays = el("div", "rc-month__weekdays");
    for (const name of weekdayShortNames(locale, firstDayOfWeek)) {
      const cell = el("div", "rc-month__weekday");
      cell.textContent = name;
      weekdays.appendChild(cell);
    }
    root.appendChild(weekdays);

    const grid = el("div", "rc-month__grid");
    const gridStart = monthGridStart(date, firstDayOfWeek);
    const layout = layoutMonth({ events, gridStart, maxLanesPerCell: maxEventsPerCell });

    for (let w = 0; w < 6; w++) {
      const row = el("div", "rc-month__week");
      row.style.setProperty("--rc-lanes", String(maxEventsPerCell));
      for (let c = 0; c < 7; c++) {
        const cellDate = addDays(gridStart, w * 7 + c);
        const cell = el("div", "rc-month__day");
        cell.dataset.date = ymd(cellDate);
        if (!isSameMonth(cellDate, date)) cell.classList.add("rc-month__day--other-month");
        if (isSameDay(cellDate, new Date())) cell.classList.add("rc-month__day--today");
        const num = el("div", "rc-month__day-number");
        num.textContent = String(cellDate.getDate());
        cell.appendChild(num);
        cell.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).closest(".rc-month__event")) return;
          this.ctx?.onDateClick?.(cellDate);
        });
        row.appendChild(cell);
      }
      const overlay = el("div", "rc-month__events");
      const week = layout[w];
      if (!week) continue;
      for (const seg of week.segments) {
        overlay.appendChild(this.renderSegment(seg, locale));
      }
      for (let c = 0; c < 7; c++) {
        const over = week.overflow[c] ?? 0;
        if (over > 0) {
          const more = el("div", "rc-month__more");
          more.textContent = `+${over} more`;
          more.style.gridColumnStart = String(c + 1);
          more.style.gridRowStart = String(maxEventsPerCell + 1);
          overlay.appendChild(more);
        }
      }
      row.appendChild(overlay);
      grid.appendChild(row);
    }

    root.appendChild(grid);
    this.host.replaceChildren(root);
  }

  private renderSegment(seg: MonthSegment, locale: string): HTMLElement {
    const node = el("div", "rc-month__event");
    if (seg.continuesLeft) node.classList.add("rc-month__event--continues-left");
    if (seg.continuesRight) node.classList.add("rc-month__event--continues-right");
    if (seg.event.allDay) node.classList.add("rc-month__event--all-day");
    if (seg.event.color) node.style.background = seg.event.color;
    if (seg.event.id === this.keyboardCarryId) {
      node.classList.add("rc-month__event--carrying");
    }

    node.style.gridColumnStart = String(seg.startCol + 1);
    node.style.gridColumnEnd = `span ${seg.span}`;
    node.style.gridRowStart = String(seg.lane + 1);

    node.dataset.eventId = seg.event.id;
    node.title = seg.event.title;
    node.tabIndex = 0;

    node.addEventListener("click", (native) => {
      native.stopPropagation();
      // Suppress click that ends a drag (the click event fires after pointerup).
      if (node.dataset.dragJustEnded === "true") {
        delete node.dataset.dragJustEnded;
        return;
      }
      this.ctx?.onEventClick?.(seg.event, native);
    });

    if (this.ctx?.dnd) {
      // Pointer drag — body of bar moves the event; trailing edge handle resizes.
      node.addEventListener("pointerdown", (e) => this.beginPointerDrag(e, node, seg, "move"));

      if (!seg.continuesRight) {
        const handle = el("div", "rc-month__event-resize");
        handle.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          this.beginPointerDrag(e, node, seg, "resize");
        });
        node.appendChild(handle);
      }

      // Keyboard drag handlers.
      node.addEventListener("keydown", (e) => this.handleKeydown(e, seg));
    }

    if (this.ctx?.eventContent) {
      const content = this.ctx.eventContent({ event: seg.event });
      if (typeof content === "string") {
        node.appendChild(document.createTextNode(content));
      } else {
        node.appendChild(content);
      }
    } else {
      const label = el("span", "rc-month__event-label");
      const start = toDate(seg.event.start);
      if (!seg.event.allDay && seg.span === 1) {
        const timePart = el("span", "rc-month__event-time");
        timePart.textContent = formatTime(start, locale);
        label.appendChild(timePart);
        label.appendChild(document.createTextNode(" "));
      }
      label.appendChild(document.createTextNode(seg.event.title));
      node.appendChild(label);
    }

    this.ctx?.eventDidMount?.({ event: seg.event, el: node });

    return node;
  }

  private beginPointerDrag(
    e: PointerEvent,
    node: HTMLElement,
    seg: MonthSegment,
    mode: DragMode,
  ): void {
    if (!this.host || !this.ctx) return;
    // Only primary pointer button.
    if (e.button !== undefined && e.button !== 0) return;

    e.preventDefault();
    this.host.dataset.rostercalDragging = mode;

    startDrag({
      origin: e,
      source: node,
      onStart: () => {
        node.classList.add(`rc-month__event--dragging-${mode}`);
      },
      onMove: (info) => {
        const hit = hitTestDateCell(info.clientX, info.clientY);
        const newYmd = hit ? ymd(hit.date) : null;
        if (newYmd === this.hoverDateYmd) return;
        // Clear old highlight.
        if (this.hoverDateYmd) this.setCellHighlight(this.hoverDateYmd, false);
        this.hoverDateYmd = newYmd;
        if (this.hoverDateYmd) this.setCellHighlight(this.hoverDateYmd, true);
      },
      onEnd: (_info, cancelled) => {
        node.classList.remove(`rc-month__event--dragging-${mode}`);
        if (this.hoverDateYmd) this.setCellHighlight(this.hoverDateYmd, false);
        const dropYmd = this.hoverDateYmd;
        this.hoverDateYmd = null;
        if (this.host) delete this.host.dataset.rostercalDragging;

        // Mark this node so the following synthetic `click` is suppressed.
        node.dataset.dragJustEnded = "true";

        if (cancelled || !dropYmd) return;
        const dropDate = parseYmd(dropYmd);
        if (!dropDate) return;
        void this.commitDrag(seg.event, mode, dropDate);
      },
    });
  }

  private async commitDrag(event: RosterEvent, mode: DragMode, dropDate: Date): Promise<void> {
    if (!this.ctx) return;
    if (mode === "move") {
      const origStart = startOfDay(toDate(event.start));
      const dayDelta = daySpan(origStart, dropDate) - 1;
      if (dayDelta === 0) return;
      const newStart = preserveTimeOfDay(
        toDate(event.start),
        addDays(toDate(event.start), dayDelta),
      );
      const proposal: { eventId: string; newStart: Date; newEnd?: Date } = {
        eventId: event.id,
        newStart,
      };
      if (event.end !== undefined) {
        proposal.newEnd = preserveTimeOfDay(
          toDate(event.end),
          addDays(toDate(event.end), dayDelta),
        );
      }
      await this.ctx.onEventDrop?.(proposal);
    } else {
      // Resize: end becomes the dropped date. Reject if it would precede the start.
      const start = startOfDay(toDate(event.start));
      if (dropDate < start) return;
      const newEnd = event.end
        ? preserveTimeOfDay(toDate(event.end), dropDate)
        : new Date(dropDate);
      await this.ctx.onEventResize?.({ eventId: event.id, newEnd });
    }
  }

  private setCellHighlight(ymdValue: string, on: boolean): void {
    if (!this.host) return;
    const cell = this.host.querySelector<HTMLElement>(`[data-date="${ymdValue}"]`);
    if (!cell) return;
    cell.classList.toggle("rc-month__day--drop-target", on);
  }

  // --- keyboard drag ---

  private handleKeydown(e: KeyboardEvent, seg: MonthSegment): void {
    if (!this.ctx) return;
    const id = seg.event.id;
    const isCarrying = this.keyboardCarryId === id;

    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!isCarrying) {
        this.keyboardCarryId = id;
        this.keyboardCarryDelta = 0;
        this.draw();
      } else {
        const delta = this.keyboardCarryDelta;
        this.cancelKeyboardDrag();
        if (delta !== 0) {
          const newStart = preserveTimeOfDay(
            toDate(seg.event.start),
            addDays(toDate(seg.event.start), delta),
          );
          const proposal: { eventId: string; newStart: Date; newEnd?: Date } = {
            eventId: id,
            newStart,
          };
          if (seg.event.end !== undefined) {
            proposal.newEnd = preserveTimeOfDay(
              toDate(seg.event.end),
              addDays(toDate(seg.event.end), delta),
            );
          }
          void this.ctx.onEventDrop?.(proposal);
        }
      }
      return;
    }

    if (e.key === "Escape" && isCarrying) {
      e.preventDefault();
      this.cancelKeyboardDrag();
      return;
    }

    if (!isCarrying) return;

    const step = arrowStep(e.key);
    if (step !== 0) {
      e.preventDefault();
      this.keyboardCarryDelta += step;
      this.draw();
    }
  }

  private cancelKeyboardDrag(): void {
    if (this.keyboardCarryId !== null) {
      this.keyboardCarryId = null;
      this.keyboardCarryDelta = 0;
      this.draw();
    }
  }
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (!y || !mo || !d) return null;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

/** Copy the time-of-day from `source` onto the date portion of `target`. */
function preserveTimeOfDay(source: Date, target: Date): Date {
  const r = new Date(target);
  r.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), source.getMilliseconds());
  return r;
}

function arrowStep(key: string): number {
  switch (key) {
    case "ArrowLeft":
      return -1;
    case "ArrowRight":
      return 1;
    case "ArrowUp":
      return -7;
    case "ArrowDown":
      return 7;
    default:
      return 0;
  }
}

export type { RosterEvent };
