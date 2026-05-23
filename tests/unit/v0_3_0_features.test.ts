import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarOptions } from "../../src/index.js";
import { Calendar } from "../../src/index.js";

afterEach(() => {
  document.body.replaceChildren();
});

function setup(overrides: Partial<CalendarOptions> = {}) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const cal = new Calendar(root, {
    view: "resource-time-grid",
    date: new Date(2026, 4, 13),
    resources: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ],
    ...overrides,
  });
  cal.render();
  return { root, cal };
}

/**
 * Install a geometry stub on `Element.prototype` so the view's hit-test can
 * resolve `(clientX, clientY)` to a column + minute. The hit-test cache is
 * populated during `draw()`, so this must be installed BEFORE `render()`.
 *
 * Layout: each column is 100px wide; the grid spans the configured window
 * height = ((max-min)/60) * 48px.
 */
function installGeometryStub(slotMinMinute: number, slotMaxMinute: number): () => void {
  const windowHeight = ((slotMaxMinute - slotMinMinute) / 60) * 48;
  const original = Element.prototype.getBoundingClientRect;
  const rect = (left: number, right: number, height: number): DOMRect =>
    ({
      left,
      right,
      top: 0,
      bottom: height,
      width: right - left,
      height,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (this.classList.contains("rc-rtg__column")) {
      const id = (this as HTMLElement).dataset.resourceId;
      const i = id === "a" ? 0 : id === "b" ? 1 : 2;
      return rect(i * 100, (i + 1) * 100, windowHeight);
    }
    if (this.classList.contains("rc-rtg__grid")) {
      return rect(0, 300, windowHeight);
    }
    return original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

describe("slotMinTime / slotMaxTime", () => {
  it("renders only slots inside [min, max) with slotMinutes alignment", () => {
    const { root } = setup({
      slotMinTime: "08:00",
      slotMaxTime: "18:00",
      slotMinutes: 30,
    });
    // 10h window / 30min = 20 axis rows.
    const axisRows = root.querySelectorAll(".rc-rtg__axis .rc-rtg__hour");
    expect(axisRows).toHaveLength(20);
    const firstLabelled = [...axisRows].find((el) => !el.classList.contains("rc-rtg__hour--sub"));
    expect(firstLabelled?.textContent ?? "").toMatch(/8/);
    const slots = root.querySelectorAll('.rc-rtg__column[data-resource-id="a"] .rc-rtg__slot');
    expect(slots).toHaveLength(20);
  });

  it("throws on min >= max", () => {
    expect(
      () =>
        new Calendar(document.createElement("div"), {
          view: "resource-time-grid",
          slotMinTime: "10:00",
          slotMaxTime: "10:00",
        }),
    ).toThrow(/earlier than slotMaxTime/);
  });

  it("throws when bounds don't align to slotMinutes", () => {
    expect(
      () =>
        new Calendar(document.createElement("div"), {
          view: "resource-time-grid",
          slotMinutes: 30,
          slotMinTime: "08:15",
          slotMaxTime: "18:00",
        }),
    ).toThrow(/align to slotMinutes/);
  });

  it("throws on malformed HH:MM", () => {
    expect(
      () =>
        new Calendar(document.createElement("div"), {
          view: "resource-time-grid",
          slotMinTime: "08-00",
        }),
    ).toThrow(/slotMinTime/);
  });
});

describe("blockedRanges", () => {
  it("renders a striped overlay only on the blocked resource column", () => {
    const { root } = setup({
      blockedRanges: [{ resourceId: "a", start: "2026-05-13T12:00", end: "2026-05-13T13:00" }],
    });
    expect(
      root.querySelectorAll('.rc-rtg__column[data-resource-id="a"] .rc-rtg__blocked'),
    ).toHaveLength(1);
    expect(
      root.querySelectorAll('.rc-rtg__column[data-resource-id="b"] .rc-rtg__blocked'),
    ).toHaveLength(0);
  });

  it("isBlocked reflects the configured ranges", () => {
    const { cal } = setup({
      blockedRanges: [{ resourceId: "a", start: "2026-05-13T12:00", end: "2026-05-13T13:00" }],
    });
    expect(cal.isBlocked(new Date(2026, 4, 13, 12, 30), "a")).toBe(true);
    expect(cal.isBlocked(new Date(2026, 4, 13, 13, 0), "a")).toBe(false); // end exclusive
    expect(cal.isBlocked(new Date(2026, 4, 13, 12, 30), "b")).toBe(false);
  });

  it("setBlockedRanges replaces the set and refreshes the view", () => {
    const { root, cal } = setup();
    expect(root.querySelectorAll(".rc-rtg__blocked")).toHaveLength(0);
    cal.setBlockedRanges([{ resourceId: "b", start: "2026-05-13T09:00", end: "2026-05-13T10:00" }]);
    expect(
      root.querySelectorAll('.rc-rtg__column[data-resource-id="b"] .rc-rtg__blocked'),
    ).toHaveLength(1);
  });

  it("emits dropRejected on external drop into a blocked range", () => {
    const restore = installGeometryStub(0, 1440);
    try {
      const { root, cal } = setup({
        blockedRanges: [{ resourceId: "a", start: "2026-05-13T12:00", end: "2026-05-13T13:00" }],
      });
      const rejected = vi.fn();
      const external = vi.fn();
      cal.on("dropRejected", rejected);
      cal.on("externalDrop", external);

      const grid = root.querySelector<HTMLElement>(".rc-rtg__grid");
      if (!grid) throw new Error("grid missing");

      // windowHeight = (1440/60) * 48 = 1152. 12:30 → y = (750/1440) * 1152 = 600.
      const dropY = (750 / 1440) * 1152;
      const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, "clientX", { value: 50 });
      Object.defineProperty(dropEvent, "clientY", { value: dropY });
      grid.dispatchEvent(dropEvent);

      expect(rejected).toHaveBeenCalledTimes(1);
      const payload = rejected.mock.calls[0]?.[0];
      expect(payload?.reason).toBe("blocked");
      expect(payload?.resourceId).toBe("a");
      expect(external).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("allowDropOnBlocked: true bypasses the rejection", () => {
    const restore = installGeometryStub(0, 1440);
    try {
      const { root, cal } = setup({
        allowDropOnBlocked: true,
        blockedRanges: [{ resourceId: "a", start: "2026-05-13T12:00", end: "2026-05-13T13:00" }],
      });
      const rejected = vi.fn();
      const external = vi.fn();
      cal.on("dropRejected", rejected);
      cal.on("externalDrop", external);

      const grid = root.querySelector<HTMLElement>(".rc-rtg__grid");
      if (!grid) throw new Error("grid missing");

      const dropY = (750 / 1440) * 1152;
      const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, "clientX", { value: 50 });
      Object.defineProperty(dropEvent, "clientY", { value: dropY });
      grid.dispatchEvent(dropEvent);

      expect(rejected).not.toHaveBeenCalled();
      expect(external).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});

describe("eventContent", () => {
  it("replaces default event body and still calls eventDidMount", () => {
    const seen: Array<{ id: string }> = [];
    const { root } = setup({
      events: [
        {
          id: "e1",
          title: "Appointment",
          resourceId: "a",
          start: "2026-05-13T14:00",
          end: "2026-05-13T15:00",
        },
      ],
      eventContent: ({ event }) => {
        const chip = document.createElement("span");
        chip.className = "my-chip";
        chip.textContent = `${event.title}!`;
        return chip;
      },
      eventDidMount: ({ event }) => {
        seen.push({ id: event.id });
      },
    });
    const node = root.querySelector<HTMLElement>('.rc-rtg__event[data-event-id="e1"]');
    expect(node).not.toBeNull();
    expect(node?.querySelector(".my-chip")?.textContent).toBe("Appointment!");
    // Default time / title elements should NOT be present when eventContent is used.
    expect(node?.querySelector(".rc-rtg__event-title")).toBeNull();
    expect(seen).toEqual([{ id: "e1" }]);
  });

  it("string return is inserted as text (not HTML)", () => {
    const { root } = setup({
      events: [
        {
          id: "e1",
          title: "Appointment",
          resourceId: "a",
          start: "2026-05-13T14:00",
          end: "2026-05-13T15:00",
        },
      ],
      eventContent: () => "<b>not bold</b>",
    });
    const node = root.querySelector<HTMLElement>('.rc-rtg__event[data-event-id="e1"]');
    expect(node?.textContent).toBe("<b>not bold</b>");
    expect(node?.querySelector("b")).toBeNull();
  });

  it("also applies in month view", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const cal = new Calendar(root, {
      view: "month",
      date: new Date(2026, 4, 13),
      events: [{ id: "m1", title: "M1", start: "2026-05-13T09:00" }],
      eventContent: ({ event }) => {
        const span = document.createElement("span");
        span.className = "month-chip";
        span.textContent = event.title;
        return span;
      },
    });
    cal.render();
    expect(root.querySelector(".month-chip")?.textContent).toBe("M1");
    expect(root.querySelector(".rc-month__event-label")).toBeNull();
  });
});
