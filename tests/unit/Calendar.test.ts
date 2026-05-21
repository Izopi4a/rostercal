import { describe, expect, it, vi } from "vitest";
import type { RosterEvent } from "../../src/index.js";
import { Calendar } from "../../src/index.js";

function ev(cal: Calendar, id: string): RosterEvent {
  const e = cal.getEvent(id);
  if (!e) throw new Error(`event ${id} missing`);
  return e;
}

describe("Calendar — construction and lifecycle", () => {
  it("constructs with no options and defaults to month view", () => {
    const root = document.createElement("div");
    const cal = new Calendar(root);
    expect(cal.getView()).toBe("month");
    expect(cal.getEvents()).toEqual([]);
    expect(cal.getResources()).toEqual([]);
  });

  it("render() mounts the month view and applies the rostercal class", () => {
    const root = document.createElement("div");
    const cal = new Calendar(root, { date: new Date(2026, 4, 13) });
    cal.render();
    expect(root.classList.contains("rostercal")).toBe(true);
    expect(root.dataset.rostercalTheme).toBe("light");
    expect(root.querySelector(".rc-month")).not.toBeNull();
    expect(root.querySelectorAll(".rc-month__day")).toHaveLength(42);
  });

  it("setTheme() updates the data-rostercal-theme attribute", () => {
    const root = document.createElement("div");
    const cal = new Calendar(root);
    cal.render();
    cal.setTheme("dark");
    expect(root.dataset.rostercalTheme).toBe("dark");
  });

  it("destroy() empties the root element and removes classes", () => {
    const root = document.createElement("div");
    const cal = new Calendar(root);
    cal.render();
    cal.destroy();
    expect(root.childElementCount).toBe(0);
    expect(root.classList.contains("rostercal")).toBe(false);
    expect(root.dataset.rostercalTheme).toBeUndefined();
  });

  it("setView() to resource-time-grid swaps the view", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const cal = new Calendar(root, {
      resources: [{ id: "a", title: "Worker A" }],
    });
    cal.render();
    cal.setView("resource-time-grid");
    expect(root.querySelector(".rc-rtg")).not.toBeNull();
  });
});

describe("Calendar — event CRUD", () => {
  it("addEvent stores the event and re-renders", () => {
    const root = document.createElement("div");
    const cal = new Calendar(root, { date: new Date(2026, 4, 13) });
    cal.render();
    cal.addEvent({ id: "e1", title: "Meeting", start: "2026-05-13T10:00" });
    expect(cal.getEvents()).toHaveLength(1);
    expect(root.querySelector(".rc-month__event")).not.toBeNull();
  });

  it("updateEvent merges the patch", () => {
    const root = document.createElement("div");
    const cal = new Calendar(root, {
      date: new Date(2026, 4, 13),
      events: [{ id: "e1", title: "Meeting", start: "2026-05-13T10:00" }],
    });
    cal.render();
    const updated = cal.updateEvent("e1", { title: "Renamed" });
    expect(updated.title).toBe("Renamed");
    expect(cal.getEvent("e1")?.title).toBe("Renamed");
  });

  it("removeEvent deletes and re-renders", () => {
    const root = document.createElement("div");
    const cal = new Calendar(root, {
      date: new Date(2026, 4, 13),
      events: [{ id: "e1", title: "Meeting", start: "2026-05-13T10:00" }],
    });
    cal.render();
    expect(root.querySelector(".rc-month__event")).not.toBeNull();
    cal.removeEvent("e1");
    expect(cal.getEvents()).toHaveLength(0);
    expect(root.querySelector(".rc-month__event")).toBeNull();
  });

  it("addEvent throws on duplicate id", () => {
    const cal = new Calendar(document.createElement("div"));
    cal.addEvent({ id: "e1", title: "A", start: "2026-05-13" });
    expect(() => cal.addEvent({ id: "e1", title: "B", start: "2026-05-13" })).toThrow(
      /already exists/,
    );
  });
});

describe("Calendar — resources", () => {
  it("addResource stores and listResource returns it", () => {
    const cal = new Calendar(document.createElement("div"));
    cal.addResource({ id: "a", title: "Worker A" });
    expect(cal.getResources()).toEqual([{ id: "a", title: "Worker A" }]);
  });

  it("removeResource deletes", () => {
    const cal = new Calendar(document.createElement("div"), {
      resources: [{ id: "a", title: "A" }],
    });
    cal.removeResource("a");
    expect(cal.getResources()).toHaveLength(0);
  });
});

describe("Calendar — navigation", () => {
  it("next() advances by one month in month view", () => {
    const cal = new Calendar(document.createElement("div"), { date: new Date(2026, 4, 13) });
    cal.next();
    expect(cal.getDate().getMonth()).toBe(5);
  });

  it("prev() moves back by one month in month view", () => {
    const cal = new Calendar(document.createElement("div"), { date: new Date(2026, 4, 13) });
    cal.prev();
    expect(cal.getDate().getMonth()).toBe(3);
  });

  it("today() sets focus date to today", () => {
    const cal = new Calendar(document.createElement("div"), { date: new Date(2020, 0, 1) });
    cal.today();
    const now = new Date();
    expect(cal.getDate().getFullYear()).toBe(now.getFullYear());
    expect(cal.getDate().getMonth()).toBe(now.getMonth());
  });

  it("setDate updates focus and re-renders the grid", () => {
    const root = document.createElement("div");
    const cal = new Calendar(root, { date: new Date(2026, 4, 13) });
    cal.render();
    cal.setDate(new Date(2027, 0, 1));
    expect(root.querySelector(".rc-month__title")?.textContent).toMatch(/January/);
    expect(root.querySelector(".rc-month__title")?.textContent).toMatch(/2027/);
  });
});

describe("Calendar — listeners", () => {
  it("emits viewChange on render, setDate, and navigation", async () => {
    const handler = vi.fn();
    const cal = new Calendar(document.createElement("div"), { date: new Date(2026, 4, 13) });
    cal.on("viewChange", handler);
    cal.render();
    cal.next();
    cal.prev();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("emits eventClick when an event element is clicked", async () => {
    const root = document.createElement("div");
    const cal = new Calendar(root, {
      date: new Date(2026, 4, 13),
      events: [{ id: "e1", title: "Meeting", start: "2026-05-13T10:00" }],
    });
    const handler = vi.fn();
    cal.on("eventClick", handler);
    cal.render();
    const node = root.querySelector(".rc-month__event") as HTMLElement;
    node.click();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].event.id).toBe("e1");
  });

  it("emits dateClick when a day cell (empty area) is clicked", async () => {
    const root = document.createElement("div");
    const cal = new Calendar(root, { date: new Date(2026, 4, 13) });
    const handler = vi.fn();
    cal.on("dateClick", handler);
    cal.render();
    const day = root.querySelector(".rc-month__day") as HTMLElement;
    day.click();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("on() returns an unsubscribe function", () => {
    const handler = vi.fn();
    const cal = new Calendar(document.createElement("div"), { date: new Date(2026, 4, 13) });
    const off = cal.on("viewChange", handler);
    cal.render();
    off();
    cal.next();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("Calendar — keyboard drag (M4)", () => {
  function setup() {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const cal = new Calendar(root, {
      date: new Date(2026, 4, 13),
      events: [{ id: "e1", title: "Meeting", start: "2026-05-13T10:00" }],
    });
    cal.render();
    return { root, cal };
  }

  function bar(root: HTMLElement, id = "e1"): HTMLElement {
    const el = root.querySelector<HTMLElement>(`.rc-month__event[data-event-id="${id}"]`);
    if (!el) throw new Error(`event bar ${id} not found`);
    return el;
  }

  function key(el: HTMLElement, k: string) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  }

  it("Space picks up; arrow moves the day; Space commits the move", async () => {
    const { root, cal } = setup();
    const dropHandler = vi.fn();
    cal.on("eventDrop", dropHandler);

    key(bar(root), " "); // pick up
    key(bar(root), "ArrowRight"); // shift +1 day
    key(bar(root), " "); // drop
    await Promise.resolve();
    await Promise.resolve();

    expect(dropHandler).toHaveBeenCalledTimes(1);
    expect(new Date(ev(cal, "e1").start).getDate()).toBe(14);
  });

  it("Escape during keyboard carry cancels without committing", async () => {
    const { root, cal } = setup();
    const dropHandler = vi.fn();
    cal.on("eventDrop", dropHandler);

    key(bar(root), " ");
    key(bar(root), "ArrowRight");
    key(bar(root), "Escape");
    await Promise.resolve();

    expect(dropHandler).not.toHaveBeenCalled();
    expect(new Date(ev(cal, "e1").start).getDate()).toBe(13);
  });

  it("ArrowDown shifts by 7 days (one week)", async () => {
    const { root, cal } = setup();
    key(bar(root), " ");
    key(bar(root), "ArrowDown");
    key(bar(root), " ");
    await Promise.resolve();
    await Promise.resolve();
    expect(new Date(ev(cal, "e1").start).getDate()).toBe(20);
  });
});

describe("Calendar — drop / resize optimistic + rollback", () => {
  function setupWith(events: { id: string; title: string; start: string; end?: string }[]) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const cal = new Calendar(root, { date: new Date(2026, 4, 13), events });
    cal.render();
    return { root, cal };
  }

  function bar(root: HTMLElement, id: string): HTMLElement {
    const el = root.querySelector<HTMLElement>(`.rc-month__event[data-event-id="${id}"]`);
    if (!el) throw new Error(`bar ${id} not found`);
    return el;
  }

  it("eventDrop handler receives oldStart and the updated event", async () => {
    const { root, cal } = setupWith([{ id: "e1", title: "x", start: "2026-05-13T10:00" }]);
    let payload: unknown;
    cal.on("eventDrop", (p) => {
      payload = p;
    });

    // Trigger move via keyboard (avoids needing pointer event hit-testing in jsdom).
    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    await Promise.resolve();
    await Promise.resolve();

    expect(payload).toMatchObject({
      event: { id: "e1" },
      oldStart: expect.any(Date),
    });
    expect((payload as { oldStart: Date }).oldStart.getDate()).toBe(13);
    expect(new Date(ev(cal, "e1").start).getDate()).toBe(14);
  });

  it("rolls back when the eventDrop handler rejects", async () => {
    const { root, cal } = setupWith([{ id: "e1", title: "x", start: "2026-05-13T10:00" }]);
    cal.on("eventDrop", async () => {
      throw new Error("backend rejected");
    });

    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(new Date(ev(cal, "e1").start).getDate()).toBe(13);
  });

  it("a move shifts both start and end by the same delta when event has an end", async () => {
    const { root, cal } = setupWith([
      { id: "e1", title: "x", start: "2026-05-12", end: "2026-05-13" },
    ]);

    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    bar(root, "e1").dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    await Promise.resolve();
    await Promise.resolve();

    const after = ev(cal, "e1");
    expect(new Date(after.start).getDate()).toBe(14);
    if (after.end === undefined) throw new Error("expected end to be set");
    expect(new Date(after.end).getDate()).toBe(15);
  });
});
