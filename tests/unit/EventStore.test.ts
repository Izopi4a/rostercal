import { describe, expect, it } from "vitest";
import { EventStore, ResourceStore } from "../../src/core/EventStore.js";

const ev = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `event-${id}`,
  start: "2026-05-13T10:00",
  ...overrides,
});

describe("EventStore", () => {
  it("constructs empty by default", () => {
    expect(new EventStore().size()).toBe(0);
  });

  it("accepts initial events", () => {
    const s = new EventStore([ev("a"), ev("b")]);
    expect(s.size()).toBe(2);
    expect(s.get("a")?.title).toBe("event-a");
  });

  it("throws on duplicate id in initial events", () => {
    expect(() => new EventStore([ev("a"), ev("a")])).toThrow(/Duplicate event id/);
  });

  it("add() inserts a new event and returns it", () => {
    const s = new EventStore();
    const e = ev("a");
    expect(s.add(e)).toEqual(e);
    expect(s.size()).toBe(1);
  });

  it("add() throws on duplicate id", () => {
    const s = new EventStore([ev("a")]);
    expect(() => s.add(ev("a"))).toThrow(/already exists/);
  });

  it("update() merges patch and returns the new value", () => {
    const s = new EventStore([ev("a", { title: "before" })]);
    const updated = s.update("a", { title: "after" });
    expect(updated.title).toBe("after");
    expect(s.get("a")?.title).toBe("after");
  });

  it("update() preserves immutable id", () => {
    const s = new EventStore([ev("a")]);
    expect(() => s.update("a", { id: "b" })).toThrow(/id cannot be changed/);
  });

  it("update() throws when event is missing", () => {
    const s = new EventStore();
    expect(() => s.update("nope", { title: "x" })).toThrow(/not found/);
  });

  it("remove() deletes an event", () => {
    const s = new EventStore([ev("a")]);
    s.remove("a");
    expect(s.size()).toBe(0);
  });

  it("remove() throws when event is missing", () => {
    const s = new EventStore();
    expect(() => s.remove("nope")).toThrow(/not found/);
  });

  it("list() returns a fresh array snapshot", () => {
    const s = new EventStore([ev("a"), ev("b")]);
    const arr = s.list();
    arr.pop();
    expect(s.size()).toBe(2);
  });

  it("clear() empties the store", () => {
    const s = new EventStore([ev("a"), ev("b")]);
    s.clear();
    expect(s.size()).toBe(0);
  });
});

describe("ResourceStore", () => {
  it("sorts resources by order when listing", () => {
    const s = new ResourceStore([
      { id: "b", title: "B", order: 2 },
      { id: "a", title: "A", order: 1 },
      { id: "c", title: "C", order: 3 },
    ]);
    expect(s.list().map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("treats missing order as 0", () => {
    const s = new ResourceStore([
      { id: "a", title: "A" },
      { id: "b", title: "B", order: -1 },
    ]);
    expect(s.list().map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("throws on duplicate id", () => {
    expect(
      () =>
        new ResourceStore([
          { id: "a", title: "A" },
          { id: "a", title: "A2" },
        ]),
    ).toThrow(/Duplicate resource id/);
  });
});
