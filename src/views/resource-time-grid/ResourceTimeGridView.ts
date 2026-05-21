import {
  formatTime,
  hourLabels,
  isSameDayTz,
  minuteOfDayTz,
  monthYearLabel,
  setMinuteOfDayTz,
  startOfDayTz,
  toDate,
} from "../../core/dates.js";
import type { RosterEvent, ViewName } from "../../core/types.js";
import { startDrag } from "../../dnd/DragController.js";
import type { View, ViewContext } from "../View.js";
import { layoutResourceTimeGrid, type TimeGridSegment } from "./layout.js";

const MINUTES_PER_DAY = 1440;
const HOUR_HEIGHT_PX = 48; // 24px per slot when slotMinutes=30 (default)

type DragMode = "move" | "resize";

export class ResourceTimeGridView implements View {
  readonly name: ViewName = "resource-time-grid";
  private host: HTMLElement | null = null;
  private ctx: ViewContext | null = null;
  private bodyEl: HTMLElement | null = null;
  private gridEl: HTMLElement | null = null;
  private dropPreviewEl: HTMLElement | null = null;
  private nowLineEl: HTMLElement | null = null;
  private nowTimer: ReturnType<typeof setInterval> | null = null;
  /** Cached column rect lookups for hit-testing during a drag. */
  private columnRects: Array<{ resourceId: string; left: number; right: number }> = [];

  mount(container: HTMLElement, ctx: ViewContext): void {
    this.host = container;
    this.ctx = ctx;
    this.draw();
    this.updateNowLine();
    this.startNowLine();
    // Auto-scroll so "now" (or 8:00 as a sensible fallback) is near the top.
    queueMicrotask(() => this.autoScroll());
  }

  unmount(): void {
    this.stopNowLine();
    if (this.host) this.host.replaceChildren();
    this.host = null;
    this.ctx = null;
    this.bodyEl = null;
    this.gridEl = null;
    this.dropPreviewEl = null;
    this.nowLineEl = null;
    this.columnRects = [];
  }

  update(ctx: ViewContext): void {
    this.ctx = ctx;
    this.draw();
    this.updateNowLine();
  }

  getVisibleRange(): { from: Date; to: Date } {
    if (!this.ctx) throw new Error("ResourceTimeGridView is not mounted");
    const tz = this.ctx.timezone;
    const from = startOfDayTz(this.ctx.date, tz);
    const to = new Date(from);
    if (tz === "UTC") to.setUTCHours(23, 59, 59, 999);
    else to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  private draw(): void {
    if (!this.host || !this.ctx) return;
    const { date, events, resources, locale, slotMinutes, hour12, timezone } = this.ctx;
    // Preserve user scroll across re-renders (drops, navigation, etc.).
    const savedScroll = this.bodyEl?.scrollTop;

    // Emit a one-time console warning if an all-day event was passed — RTG is timed-only in v0.
    const hasAllDay = events.some((e) => e.allDay === true);
    if (hasAllDay) {
      console.warn(
        "rostercal: resource-time-grid ignores allDay events in v0. " +
          "Use the month view if you need all-day rendering.",
      );
    }

    const root = el("div", "rc-rtg");
    const slotHeightPx = (HOUR_HEIGHT_PX * slotMinutes) / 60;
    root.style.setProperty("--rc-rtg-slot-minutes", String(slotMinutes));
    root.style.setProperty("--rc-rtg-slot-height", `${slotHeightPx}px`);
    root.style.setProperty("--rc-rtg-hour-height", `${HOUR_HEIGHT_PX}px`);
    root.style.setProperty("--rc-rtg-day-height", `${HOUR_HEIGHT_PX * 24}px`);
    root.style.setProperty("--rc-rtg-resources", String(resources.length));

    const title = el("div", "rc-rtg__title");
    title.textContent = `${monthYearLabel(date, locale)} — ${date.getDate()}`;
    root.appendChild(title);

    // Scrollable body: 2x2 grid (axis + content) x (header + body). Header is sticky
    // inside the scroll container so it shares the body's width — keeps columns aligned
    // even when the vertical scrollbar appears.
    const body = el("div", "rc-rtg__body");
    this.bodyEl = body;

    const corner = el("div", "rc-rtg__corner");
    body.appendChild(corner);

    const header = el("div", "rc-rtg__header");
    for (const r of resources) {
      const col = el("div", "rc-rtg__resource");
      col.textContent = r.title;
      col.dataset.resourceId = r.id;
      header.appendChild(col);
    }
    body.appendChild(header);

    const axis = el("div", "rc-rtg__axis");
    const labels = hourLabels(locale, hour12, timezone);
    for (let h = 0; h < 24; h++) {
      const slot = el("div", "rc-rtg__hour");
      slot.textContent = labels[h] ?? String(h);
      axis.appendChild(slot);
    }
    body.appendChild(axis);

    const grid = el("div", "rc-rtg__grid");
    const segments = layoutResourceTimeGrid({ events, resources, day: date, slotMinutes, timezone });
    const slotsPerDay = Math.round(MINUTES_PER_DAY / slotMinutes);

    for (const r of resources) {
      const col = el("div", "rc-rtg__column");
      col.dataset.resourceId = r.id;
      for (let i = 0; i < slotsPerDay; i++) {
        const slotCell = el("div", "rc-rtg__slot");
        slotCell.style.top = `${i * slotHeightPx}px`;
        const endsOnHour = ((i + 1) * slotMinutes) % 60 === 0;
        if (!endsOnHour) slotCell.classList.add("rc-rtg__slot--sub-hour");
        if (this.ctx.slotDidMount) {
          const slotDate = setMinuteOfDayTz(date, i * slotMinutes, timezone);
          this.ctx.slotDidMount({ date: slotDate, resourceId: r.id, el: slotCell });
        }
        col.appendChild(slotCell);
      }
      grid.appendChild(col);
    }

    for (const seg of segments) {
      const col = grid.querySelector<HTMLElement>(
        `.rc-rtg__column[data-resource-id="${seg.resourceId}"]`,
      );
      if (!col) continue;
      col.appendChild(this.renderSegment(seg, locale, hour12, timezone));
    }

    const nowLine = el("div", "rc-rtg__now-line");
    grid.appendChild(nowLine);
    this.nowLineEl = nowLine;
    this.gridEl = grid;

    grid.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      if (!this.ctx) return;
      const hit = this.hitTest(e.clientX, e.clientY);
      if (!hit) return;
      this.showDropPreview(hit.resourceId, snapMinutes(hit.minute, this.ctx.slotMinutes));
      this.setColumnHighlight(hit.resourceId, true);
    });
    grid.addEventListener("dragleave", (e) => {
      // Only clear when leaving the grid entirely (not moving between children).
      if (!grid.contains(e.relatedTarget as Node | null)) {
        this.hideDropPreview();
        this.clearAllColumnHighlights();
      }
    });
    grid.addEventListener("drop", (e) => {
      e.preventDefault();
      this.hideDropPreview();
      this.clearAllColumnHighlights();
      if (!this.ctx) return;
      const hit = this.hitTest(e.clientX, e.clientY);
      if (!hit) return;
      const snapped = snapMinutes(hit.minute, this.ctx.slotMinutes);
      const date = setMinuteOfDayTz(this.ctx.date, snapped, this.ctx.timezone);
      this.ctx.onExternalDrop?.(date, hit.resourceId);
    });

    body.appendChild(grid);
    root.appendChild(body);
    this.host.replaceChildren(root);

    if (savedScroll !== undefined) body.scrollTop = savedScroll;

    // Recompute column rects for drag hit-testing.
    this.columnRects = [];
    for (const col of grid.querySelectorAll<HTMLElement>(".rc-rtg__column")) {
      const id = col.dataset.resourceId;
      if (!id) continue;
      const rect = col.getBoundingClientRect();
      this.columnRects.push({ resourceId: id, left: rect.left, right: rect.right });
    }
  }

  private renderSegment(
    seg: TimeGridSegment,
    locale: string,
    hour12: boolean | undefined,
    timezone: "local" | "UTC",
  ): HTMLElement {
    const node = el("div", "rc-rtg__event");
    const top = (seg.startMinute / MINUTES_PER_DAY) * (HOUR_HEIGHT_PX * 24);
    const height = Math.max(
      16,
      ((seg.endMinute - seg.startMinute) / MINUTES_PER_DAY) * (HOUR_HEIGHT_PX * 24),
    );
    node.style.top = `${top}px`;
    node.style.height = `${height}px`;
    node.style.left = `${(seg.lane / seg.totalLanes) * 100}%`;
    node.style.width = `${100 / seg.totalLanes}%`;
    node.dataset.eventId = seg.event.id;
    if (seg.event.color) node.style.background = seg.event.color;
    node.title = seg.event.title;
    node.tabIndex = 0;

    node.addEventListener("click", (native) => {
      native.stopPropagation();
      if (node.dataset.dragJustEnded === "true") {
        delete node.dataset.dragJustEnded;
        return;
      }
      this.ctx?.onEventClick?.(seg.event, native);
    });

    if (this.ctx?.dnd) {
      node.addEventListener("pointerdown", (e) => this.beginPointerDrag(e, node, seg, "move"));
      // Resize handle on the bottom edge.
      const handle = el("div", "rc-rtg__event-resize");
      handle.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        this.beginPointerDrag(e, node, seg, "resize");
      });
      node.appendChild(handle);
    }

    const time = el("div", "rc-rtg__event-time");
    time.textContent = `${formatTime(toDate(seg.event.start), locale, hour12, timezone)}${
      seg.event.end ? ` – ${formatTime(toDate(seg.event.end), locale, hour12, timezone)}` : ""
    }`;
    const title = el("div", "rc-rtg__event-title");
    title.textContent = seg.event.title;
    node.appendChild(time);
    node.appendChild(title);

    this.ctx?.eventDidMount?.({ event: seg.event, el: node });

    return node;
  }

  // --- drag & drop ---

  private beginPointerDrag(
    e: PointerEvent,
    node: HTMLElement,
    seg: TimeGridSegment,
    mode: DragMode,
  ): void {
    if (!this.host || !this.ctx || !this.bodyEl) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    this.host.dataset.rostercalDragging = mode;

    const slotMinutes = this.ctx.slotMinutes;
    const startMinuteOrig = seg.startMinute;
    const endMinuteOrig = seg.endMinute;

    startDrag({
      origin: e,
      source: node,
      onStart: () => {
        node.classList.add(`rc-rtg__event--dragging-${mode}`);
      },
      onMove: (info) => {
        const hit = this.hitTest(info.clientX, info.clientY);
        if (!hit) return;
        if (mode === "move") {
          const dur = endMinuteOrig - startMinuteOrig;
          const snappedStart = snapMinutes(hit.minute, slotMinutes);
          node.style.top = `${(snappedStart / MINUTES_PER_DAY) * (HOUR_HEIGHT_PX * 24)}px`;
          node.style.height = `${(dur / MINUTES_PER_DAY) * (HOUR_HEIGHT_PX * 24)}px`;
          // Translate horizontally to follow the target column visually.
          const orig = this.columnRects.find((c) => c.resourceId === seg.resourceId);
          const target = this.columnRects.find((c) => c.resourceId === hit.resourceId);
          if (orig && target) {
            node.style.transform = `translateX(${target.left - orig.left}px)`;
          }
          this.setColumnHighlight(hit.resourceId, true);
        } else {
          // resize: bottom edge follows the pointer, clamped to start + slotMinutes minimum
          const snappedEnd = Math.max(
            snapMinutes(hit.minute, slotMinutes),
            startMinuteOrig + slotMinutes,
          );
          const h = ((snappedEnd - startMinuteOrig) / MINUTES_PER_DAY) * (HOUR_HEIGHT_PX * 24);
          node.style.height = `${h}px`;
        }
      },
      onEnd: (info, cancelled) => {
        node.classList.remove(`rc-rtg__event--dragging-${mode}`);
        if (this.host) delete this.host.dataset.rostercalDragging;
        this.clearAllColumnHighlights();
        node.dataset.dragJustEnded = "true";

        // Reset inline styles — the next draw() will reposition correctly from data,
        // or for a cancelled drag we just want the visual to snap back.
        node.style.transform = "";

        if (cancelled) {
          node.style.top = "";
          node.style.height = "";
          return;
        }
        const hit = this.hitTest(info.clientX, info.clientY);
        if (!hit) {
          node.style.top = "";
          node.style.height = "";
          return;
        }
        void this.commitDrag(seg.event, mode, hit, startMinuteOrig, endMinuteOrig);
      },
    });
  }

  private async commitDrag(
    event: RosterEvent,
    mode: DragMode,
    hit: { resourceId: string; minute: number },
    startMinuteOrig: number,
    endMinuteOrig: number,
  ): Promise<void> {
    if (!this.ctx) return;
    const slotMinutes = this.ctx.slotMinutes;
    const day = this.ctx.date;

    if (mode === "move") {
      const dur = endMinuteOrig - startMinuteOrig;
      const newStartMinute = snapMinutes(hit.minute, slotMinutes);
      const tz = this.ctx.timezone;
      const newStart = setMinuteOfDayTz(day, newStartMinute, tz);
      const proposal: {
        eventId: string;
        newStart: Date;
        newEnd?: Date;
        newResourceId?: string;
      } = {
        eventId: event.id,
        newStart,
      };
      if (event.end !== undefined) {
        proposal.newEnd = setMinuteOfDayTz(day, newStartMinute + dur, tz);
      }
      if (event.resourceId !== hit.resourceId) {
        proposal.newResourceId = hit.resourceId;
      }
      await this.ctx.onEventDrop?.(proposal);
    } else {
      const tz = this.ctx.timezone;
      const newEndMinute = Math.max(
        snapMinutes(hit.minute, slotMinutes),
        startMinuteOrig + slotMinutes,
      );
      const newEnd = setMinuteOfDayTz(day, newEndMinute, tz);
      await this.ctx.onEventResize?.({ eventId: event.id, newEnd });
    }
  }

  /** Hit-test (x, y) within the body. Returns the resource column + minute under the pointer. */
  private hitTest(clientX: number, clientY: number): { resourceId: string; minute: number } | null {
    if (!this.gridEl) return null;
    const hit = this.columnRects.find((c) => clientX >= c.left && clientX < c.right);
    if (!hit) return null;
    // Use the grid element's rect directly — it already accounts for the sticky header
    // offset and scroll position, so no manual scrollTop adjustment is needed.
    const gridRect = this.gridEl.getBoundingClientRect();
    const dy = clientY - gridRect.top;
    const totalHeight = HOUR_HEIGHT_PX * 24;
    const minute = Math.max(
      0,
      Math.min(MINUTES_PER_DAY - 1, Math.floor((dy / totalHeight) * MINUTES_PER_DAY)),
    );
    return { resourceId: hit.resourceId, minute };
  }

  private showDropPreview(resourceId: string, startMinute: number): void {
    if (!this.gridEl || !this.ctx) return;
    const col = this.gridEl.querySelector<HTMLElement>(
      `.rc-rtg__column[data-resource-id="${resourceId}"]`,
    );
    if (!col) return;
    if (!this.dropPreviewEl || this.dropPreviewEl.parentElement !== col) {
      this.hideDropPreview();
      const preview = el("div", "rc-rtg__drop-preview");
      col.appendChild(preview);
      this.dropPreviewEl = preview;
    }
    const top = (startMinute / MINUTES_PER_DAY) * (HOUR_HEIGHT_PX * 24);
    const height = (this.ctx.slotMinutes / MINUTES_PER_DAY) * (HOUR_HEIGHT_PX * 24);
    this.dropPreviewEl.style.top = `${top}px`;
    this.dropPreviewEl.style.height = `${height}px`;
  }

  private hideDropPreview(): void {
    this.dropPreviewEl?.remove();
    this.dropPreviewEl = null;
  }

  private setColumnHighlight(resourceId: string, on: boolean): void {
    if (!this.host) return;
    if (on) this.clearAllColumnHighlights();
    const col = this.host.querySelector<HTMLElement>(
      `.rc-rtg__column[data-resource-id="${resourceId}"]`,
    );
    col?.classList.toggle("rc-rtg__column--drop-target", on);
  }

  private clearAllColumnHighlights(): void {
    if (!this.host) return;
    for (const col of this.host.querySelectorAll(".rc-rtg__column--drop-target")) {
      col.classList.remove("rc-rtg__column--drop-target");
    }
  }

  private autoScroll(): void {
    if (!this.bodyEl || !this.ctx) return;
    const now = new Date();
    const tz = this.ctx.timezone;
    // Scroll to ~1 hour before "now" (or 8am if it's a non-today view).
    const scrollMinute = isSameDayTz(this.ctx.date, now, tz)
      ? Math.max(0, minuteOfDayTz(now, tz) - 60)
      : 8 * 60;
    const totalHeight = HOUR_HEIGHT_PX * 24;
    this.bodyEl.scrollTop = (scrollMinute / MINUTES_PER_DAY) * totalHeight;
  }

  private startNowLine(): void {
    this.stopNowLine();
    this.nowTimer = setInterval(() => this.updateNowLine(), 60_000);
  }

  private stopNowLine(): void {
    if (this.nowTimer !== null) {
      clearInterval(this.nowTimer);
      this.nowTimer = null;
    }
  }

  private updateNowLine(): void {
    if (!this.nowLineEl || !this.ctx) return;
    const tz = this.ctx.timezone;
    const now = new Date();
    const isToday = isSameDayTz(this.ctx.date, now, tz);
    this.nowLineEl.style.display = isToday ? "block" : "none";
    if (isToday) {
      const minute = minuteOfDayTz(now, tz);
      this.nowLineEl.style.top = `${(minute / MINUTES_PER_DAY) * (HOUR_HEIGHT_PX * 24)}px`;
    }
  }
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function snapMinutes(minute: number, slotMinutes: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minute / slotMinutes) * slotMinutes));
}
