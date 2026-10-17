import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarOptions } from "../../src/index.js";
import { Calendar } from "../../src/index.js";

// Window 08:00–12:00 at the default 48px/hour: the grid is 192px tall, 0.8px per minute.
const WINDOW_HEIGHT = 192;

let restoreGeometry: (() => void) | null = null;

afterEach(() => {
  restoreGeometry?.();
  restoreGeometry = null;
  document.body.replaceChildren();
});

function setup(overrides: Partial<CalendarOptions> = {}) {
  restoreGeometry = installGeometryStub();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const cal = new Calendar(root, {
    view: "resource-time-grid",
    date: new Date(Date.UTC(2026, 4, 13, 12)),
    timezone: "UTC",
    slotMinTime: "08:00",
    slotMaxTime: "12:00",
    resources: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ],
    ...overrides,
  });
  cal.render();
  return { root, cal };
}

/** 100px columns, the grid as tall as the window, top at 0. */
function installGeometryStub(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  const rect = (left: number, right: number): DOMRect =>
    ({
      left,
      right,
      top: 0,
      bottom: WINDOW_HEIGHT,
      width: right - left,
      height: WINDOW_HEIGHT,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (this.classList.contains("rc-rtg__column")) {
      const i = (this as HTMLElement).dataset.resourceId === "a" ? 0 : 1;
      return rect(i * 100, (i + 1) * 100);
    }
    if (this.classList.contains("rc-rtg__grid")) return rect(0, 200);
    return original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

function column(root: HTMLElement, id: string): HTMLElement {
  const col = root.querySelector<HTMLElement>(`.rc-rtg__column[data-resource-id="${id}"]`);
  if (!col) throw new Error(`no column ${id}`);
  return col;
}

function pointer(type: string, clientX: number, clientY: number): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 1,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });
}

/** A full press: pointerdown + pointerup + click on the same target. */
function press(target: Element, clientX: number, clientY: number): void {
  target.dispatchEvent(pointer("pointerdown", clientX, clientY));
  target.dispatchEvent(pointer("pointerup", clientX, clientY));
  target.dispatchEvent(new MouseEvent("click", { clientX, clientY, bubbles: true }));
}

const appointment = {
  id: "e1",
  title: "Appointment",
  resourceId: "a",
  start: "2026-05-13T10:00:00Z",
  end: "2026-05-13T11:00:00Z",
};

describe("dateClick in resource-time-grid", () => {
  it("emits the start of the clicked slot and the column's resource", () => {
    const { root, cal } = setup();
    const onDateClick = vi.fn();
    cal.on("dateClick", onDateClick);

    // y=70 → minute 87.5 into the window → 09:27, inside the 09:00 slot
    press(column(root, "b"), 150, 70);

    expect(onDateClick).toHaveBeenCalledTimes(1);
    expect(onDateClick).toHaveBeenCalledWith({
      date: new Date("2026-05-13T09:00:00Z"),
      resourceId: "b",
      blocked: false,
    });
  });

  it("follows slotMinutes", () => {
    const { root, cal } = setup({ slotMinutes: 15 });
    const onDateClick = vi.fn();
    cal.on("dateClick", onDateClick);

    press(column(root, "a"), 50, 70);

    expect(onDateClick.mock.calls[0]?.[0].date).toEqual(new Date("2026-05-13T09:15:00Z"));
  });

  it("clamps a click on the bottom edge into the last slot", () => {
    const { root, cal } = setup();
    const onDateClick = vi.fn();
    cal.on("dateClick", onDateClick);

    press(column(root, "a"), 50, WINDOW_HEIGHT);

    expect(onDateClick.mock.calls[0]?.[0].date).toEqual(new Date("2026-05-13T11:30:00Z"));
  });

  it("a click on an event emits only eventClick", () => {
    const { root, cal } = setup({ events: [appointment] });
    const onDateClick = vi.fn();
    const onEventClick = vi.fn();
    cal.on("dateClick", onDateClick);
    cal.on("eventClick", onEventClick);

    const node = root.querySelector<HTMLElement>('.rc-rtg__event[data-event-id="e1"]');
    if (!node) throw new Error("no event");
    press(node, 50, 100);

    expect(onEventClick).toHaveBeenCalledTimes(1);
    expect(onDateClick).not.toHaveBeenCalled();
  });

  it("a click right after dragging an event emits nothing", () => {
    const { root, cal } = setup({ events: [appointment] });
    const onDateClick = vi.fn();
    cal.on("dateClick", onDateClick);

    const node = root.querySelector<HTMLElement>('.rc-rtg__event[data-event-id="e1"]');
    if (!node) throw new Error("no event");
    node.dispatchEvent(pointer("pointerdown", 50, 100));
    window.dispatchEvent(pointer("pointermove", 50, 40));
    window.dispatchEvent(pointer("pointerup", 50, 40));
    // the browser sends the click to whatever is under the pointer now: the empty column
    column(root, "a").dispatchEvent(
      new MouseEvent("click", { clientX: 50, clientY: 40, bubbles: true }),
    );

    expect(onDateClick).not.toHaveBeenCalled();

    // and the next plain click works again
    press(column(root, "a"), 50, 40);
    expect(onDateClick).toHaveBeenCalledTimes(1);
  });

  it("fires in a blocked range with blocked: true", () => {
    const { root, cal } = setup({
      blockedRanges: [
        { resourceId: "a", start: "2026-05-13T08:00:00Z", end: "2026-05-13T09:00:00Z" },
      ],
    });
    const onDateClick = vi.fn();
    cal.on("dateClick", onDateClick);

    press(column(root, "a"), 50, 10);
    press(column(root, "b"), 150, 10);

    expect(onDateClick.mock.calls.map(([p]) => p.blocked)).toEqual([true, false]);
  });

  it('leaves a slot "+" button to its own handler, but the rest of that slot still clicks', () => {
    const onAdd = vi.fn();
    const { root, cal } = setup({
      slotDidMount: ({ el }) => {
        const button = document.createElement("button");
        button.className = "rc-rtg__slot-add";
        button.addEventListener("click", onAdd);
        el.appendChild(button);
      },
    });
    const onDateClick = vi.fn();
    cal.on("dateClick", onDateClick);

    const slot = column(root, "a").querySelector<HTMLElement>(".rc-rtg__slot");
    const button = slot?.querySelector(".rc-rtg__slot-add");
    if (!slot || !button) throw new Error("no slot button");
    press(button, 50, 12);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onDateClick).not.toHaveBeenCalled();

    press(slot, 50, 12);
    expect(onDateClick).toHaveBeenCalledWith({
      date: new Date("2026-05-13T08:00:00Z"),
      resourceId: "a",
      blocked: false,
    });
  });
});

describe("dateClick in month", () => {
  it("emits only the date", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const cal = new Calendar(root, { view: "month", date: new Date(2026, 4, 13) });
    cal.render();
    const onDateClick = vi.fn();
    cal.on("dateClick", onDateClick);

    root.querySelector<HTMLElement>(".rc-month__day")?.click();

    expect(onDateClick).toHaveBeenCalledTimes(1);
    expect(Object.keys(onDateClick.mock.calls[0]?.[0])).toEqual(["date"]);
  });
});
