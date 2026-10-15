import { afterEach, describe, expect, it } from "vitest";
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
    date: new Date(Date.UTC(2026, 4, 13, 12)),
    timezone: "UTC",
    resources: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ],
    ...overrides,
  });
  cal.render();
  return { root, cal };
}

/** Same stub as the 0.3.0 tests: 100px columns, the grid as tall as the window. */
function installGeometryStub(windowHeight: number): () => void {
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
      const i = id === "a" ? 0 : 1;
      return rect(i * 100, (i + 1) * 100, windowHeight);
    }
    if (this.classList.contains("rc-rtg__grid")) {
      return rect(0, 200, windowHeight);
    }
    return original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

describe("hourHeight", () => {
  it("scales the day and the slots", () => {
    const { root } = setup({ hourHeight: 80, slotMinutes: 15 });
    const rtg = root.querySelector<HTMLElement>(".rc-rtg");
    expect(rtg?.style.getPropertyValue("--rc-rtg-hour-height")).toBe("80px");
    expect(rtg?.style.getPropertyValue("--rc-rtg-slot-height")).toBe("20px");
    expect(rtg?.style.getPropertyValue("--rc-rtg-day-height")).toBe(`${24 * 80}px`);
  });

  it("defaults to 48px", () => {
    const { root } = setup();
    const rtg = root.querySelector<HTMLElement>(".rc-rtg");
    expect(rtg?.style.getPropertyValue("--rc-rtg-hour-height")).toBe("48px");
  });
});

describe("height", () => {
  it('"auto" marks the grid so the page scrolls instead of the body', () => {
    const { root } = setup({ height: "auto" });
    expect(root.querySelector(".rc-rtg")?.classList.contains("rc-rtg--auto-height")).toBe(true);
    expect(root.querySelector<HTMLElement>(".rc-rtg__body")?.style.height).toBe("");
  });

  it("a number is a fixed pixel height on the body", () => {
    const { root } = setup({ height: 500 });
    expect(root.querySelector<HTMLElement>(".rc-rtg__body")?.style.height).toBe("500px");
    expect(root.querySelector(".rc-rtg")?.classList.contains("rc-rtg--auto-height")).toBe(false);
  });
});

describe("showTitle", () => {
  it("renders the title by default and hides it on false", () => {
    expect(setup().root.querySelector(".rc-rtg__title")).not.toBeNull();
    document.body.replaceChildren();
    expect(setup({ showTitle: false }).root.querySelector(".rc-rtg__title")).toBeNull();
  });
});

describe("now", () => {
  it("positions the now-line from the given clock", () => {
    const { root } = setup({
      slotMinTime: "08:00",
      slotMaxTime: "22:00",
      now: () => new Date(Date.UTC(2026, 4, 13, 10, 30)),
    });
    const line = root.querySelector<HTMLElement>(".rc-rtg__now-line");
    expect(line?.style.display).toBe("block");
    // 10:30 is 150 minutes into a 14h window of 14 * 48px
    expect(line?.style.top).toBe(`${(150 / 840) * 14 * 48}px`);
  });

  it("hides the now-line when the clock says another day", () => {
    const { root } = setup({ now: () => new Date(Date.UTC(2026, 4, 14, 10, 30)) });
    expect(root.querySelector<HTMLElement>(".rc-rtg__now-line")?.style.display).toBe("none");
  });
});

describe("externalDragMinutes", () => {
  function previewHeightFor(options: Partial<CalendarOptions>): number {
    const restore = installGeometryStub(24 * 48);
    try {
      const { root } = setup(options);
      const grid = root.querySelector<HTMLElement>(".rc-rtg__grid");
      if (!grid) throw new Error("grid missing");
      const over = new Event("dragover", { bubbles: true, cancelable: true });
      Object.defineProperty(over, "clientX", { value: 50 });
      Object.defineProperty(over, "clientY", { value: (600 / 1440) * 24 * 48 }); // 10:00
      grid.dispatchEvent(over);
      const preview = root.querySelector<HTMLElement>(".rc-rtg__drop-preview");
      if (!preview) throw new Error("preview missing");
      return Number.parseFloat(preview.style.height);
    } finally {
      restore();
    }
  }

  it("defaults to one slot", () => {
    expect(previewHeightFor({ slotMinutes: 30 })).toBeCloseTo(24);
  });

  it("takes a number or a function answering for the current drag", () => {
    expect(previewHeightFor({ externalDragMinutes: 90 })).toBeCloseTo(72);
    expect(previewHeightFor({ externalDragMinutes: () => 60 })).toBeCloseTo(48);
    expect(previewHeightFor({ externalDragMinutes: () => undefined })).toBeCloseTo(24);
  });

  it("is cut at the end of the window", () => {
    // 10:00 + 3h in a window ending at 12:00 → 2h shown
    expect(previewHeightFor({ slotMaxTime: "12:00", externalDragMinutes: 180 })).toBeCloseTo(96);
  });
});

describe("setEvents", () => {
  it("replaces every event in one render", () => {
    const { root, cal } = setup({
      events: [
        {
          id: "1",
          title: "one",
          start: "2026-05-13T09:00Z",
          end: "2026-05-13T10:00Z",
          resourceId: "a",
        },
      ],
    });
    expect(root.querySelectorAll(".rc-rtg__event")).toHaveLength(1);
    cal.setEvents([
      {
        id: "2",
        title: "two",
        start: "2026-05-13T11:00Z",
        end: "2026-05-13T12:00Z",
        resourceId: "a",
      },
      {
        id: "3",
        title: "three",
        start: "2026-05-13T11:00Z",
        end: "2026-05-13T12:00Z",
        resourceId: "b",
      },
    ]);
    expect(cal.getEvents().map((e) => e.id)).toEqual(["2", "3"]);
    expect(root.querySelectorAll(".rc-rtg__event")).toHaveLength(2);
    expect(cal.getEvent("1")).toBeUndefined();
  });
});
