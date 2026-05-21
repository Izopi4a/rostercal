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
      { id: "a", title: "Worker A" },
      { id: "b", title: "Worker B" },
      { id: "c", title: "Worker C" },
    ],
    ...overrides,
  });
  cal.render();
  return { root, cal };
}

describe("ResourceTimeGridView — rendering", () => {
  it("renders one column per resource", () => {
    const { root } = setup();
    expect(root.querySelectorAll(".rc-rtg__column")).toHaveLength(3);
  });

  it("renders 24 hour labels on the axis", () => {
    const { root } = setup();
    expect(root.querySelectorAll(".rc-rtg__hour")).toHaveLength(24);
  });

  it("places a timed event into its resource's column", () => {
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
    });
    const colA = root.querySelector<HTMLElement>('.rc-rtg__column[data-resource-id="a"]');
    expect(colA?.querySelectorAll(".rc-rtg__event")).toHaveLength(1);
    const colB = root.querySelector<HTMLElement>('.rc-rtg__column[data-resource-id="b"]');
    expect(colB?.querySelectorAll(".rc-rtg__event")).toHaveLength(0);
  });

  it("ignores allDay events with a console warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setup({
      events: [{ id: "x", title: "x", resourceId: "a", start: "2026-05-13", allDay: true }],
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("splits column when two events on the same resource overlap", () => {
    const { root } = setup({
      events: [
        {
          id: "a1",
          title: "A1",
          resourceId: "a",
          start: "2026-05-13T09:00",
          end: "2026-05-13T11:00",
        },
        {
          id: "a2",
          title: "A2",
          resourceId: "a",
          start: "2026-05-13T10:00",
          end: "2026-05-13T12:00",
        },
      ],
    });
    const events = root.querySelectorAll<HTMLElement>(
      '.rc-rtg__column[data-resource-id="a"] .rc-rtg__event',
    );
    expect(events).toHaveLength(2);
    // Each event should occupy 50% of the column width.
    expect(events[0]?.style.width).toBe("50%");
    expect(events[1]?.style.width).toBe("50%");
  });

  it("getDate / next / prev step by day in RTG mode", () => {
    const { cal } = setup();
    expect(cal.getDate().getDate()).toBe(13);
    cal.next();
    expect(cal.getDate().getDate()).toBe(14);
    cal.prev();
    cal.prev();
    expect(cal.getDate().getDate()).toBe(12);
  });
});

describe("ResourceTimeGridView — viewChange + month switching", () => {
  it("setView('month') swaps from RTG back to month", () => {
    const { root, cal } = setup();
    expect(root.querySelector(".rc-rtg")).not.toBeNull();
    cal.setView("month");
    expect(root.querySelector(".rc-rtg")).toBeNull();
    expect(root.querySelector(".rc-month")).not.toBeNull();
  });
});
