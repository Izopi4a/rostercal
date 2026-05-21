import { afterEach, describe, expect, it, vi } from "vitest";
import { applyUrlTemplate, CrudController, parseOpString } from "../../src/data/CrudAdapter.js";
import { Calendar } from "../../src/index.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("parseOpString", () => {
  it("splits method and url", () => {
    expect(parseOpString("GET /api/events")).toEqual({
      method: "GET",
      urlTemplate: "/api/events",
    });
  });

  it("accepts all five methods", () => {
    expect(parseOpString("POST /x").method).toBe("POST");
    expect(parseOpString("PUT /x").method).toBe("PUT");
    expect(parseOpString("PATCH /x").method).toBe("PATCH");
    expect(parseOpString("DELETE /x").method).toBe("DELETE");
  });

  it("throws on malformed input", () => {
    // @ts-expect-error — deliberately invalid for runtime assertion.
    expect(() => parseOpString("PURGE /x")).toThrow(/Invalid op string/);
    // @ts-expect-error
    expect(() => parseOpString("GET")).toThrow(/Invalid op string/);
  });
});

describe("applyUrlTemplate", () => {
  it("substitutes :id and url-encodes", () => {
    expect(applyUrlTemplate("/api/events/:id", { id: "abc 1" })).toBe("/api/events/abc%201");
  });

  it("substitutes :from and :to with ISO timestamps", () => {
    const from = new Date("2026-05-01T00:00:00.000Z");
    const to = new Date("2026-05-31T23:59:59.000Z");
    expect(applyUrlTemplate("/api/events?from=:from&to=:to", { from, to })).toBe(
      `/api/events?from=${from.toISOString()}&to=${to.toISOString()}`,
    );
  });

  it("leaves unknown placeholders intact", () => {
    expect(applyUrlTemplate("/x/:other", {})).toBe("/x/:other");
  });
});

describe("CrudController — fetcher", () => {
  function mkFetcher(responses: Record<string, { status?: number; body?: unknown }>) {
    return vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const key = `${init?.method ?? "GET"} ${url}`;
      const r = responses[key];
      if (!r) throw new Error(`unmocked request: ${key}`);
      const body = r.body !== undefined ? JSON.stringify(r.body) : "";
      const headers = r.body !== undefined ? { "content-type": "application/json" } : {};
      return new Response(body, { status: r.status ?? 200, headers });
    });
  }

  it("list() with OpString hits the fetcher and parses JSON", async () => {
    const fetcher = mkFetcher({
      [`GET /api/events?from=${new Date("2026-05-01").toISOString()}&to=${new Date("2026-05-31").toISOString()}`]:
        { body: [{ id: "e1", title: "x", start: "2026-05-13T10:00" }] },
    });
    const c = new CrudController({
      list: "GET /api/events?from=:from&to=:to",
      fetcher,
    });
    const out = await c.list({ from: new Date("2026-05-01"), to: new Date("2026-05-31") });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("e1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("create() POSTs the JSON body", async () => {
    const fetcher = mkFetcher({ "POST /api/events": { status: 201, body: { id: "e1" } } });
    const c = new CrudController({ create: "POST /api/events", fetcher });
    await c.create({ id: "e1", title: "x", start: "2026-05-13T10:00" });
    const call = fetcher.mock.calls[0];
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.body).toContain("e1");
  });

  it("rejects when the server returns non-2xx", async () => {
    const fetcher = mkFetcher({ "DELETE /api/events/e1": { status: 500 } });
    const c = new CrudController({ delete: "DELETE /api/events/:id", fetcher });
    await expect(c.delete("e1")).rejects.toThrow(/500/);
  });

  it("function form bypasses the fetcher entirely", async () => {
    const fn = vi.fn(async () => undefined);
    const c = new CrudController({ create: fn });
    await c.create({ id: "e1", title: "x", start: "2026-05-13T10:00" });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("fromServer transforms list payload", async () => {
    const fetcher = mkFetcher({
      [`GET /api/events?from=${new Date("2026-05-01").toISOString()}&to=${new Date("2026-05-31").toISOString()}`]:
        { body: { items: [{ uuid: "1", name: "x", at: "2026-05-13T10:00" }] } },
    });
    const c = new CrudController({
      list: "GET /api/events?from=:from&to=:to",
      fetcher,
      fromServer: (raw) => {
        const items = (raw as { items: Array<{ uuid: string; name: string; at: string }> }).items;
        return items.map((i) => ({ id: i.uuid, title: i.name, start: i.at }));
      },
    });
    const out = await c.list({ from: new Date("2026-05-01"), to: new Date("2026-05-31") });
    expect(out).toEqual([{ id: "1", title: "x", start: "2026-05-13T10:00" }]);
  });
});

describe("Calendar — CRUD integration", () => {
  it("loads events via adapter.list on render", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const list = vi.fn(async () => [{ id: "e1", title: "from server", start: "2026-05-13T10:00" }]);
    const cal = new Calendar(root, { date: new Date(2026, 4, 13), data: { list } });
    cal.render();
    await flush();
    expect(list).toHaveBeenCalledOnce();
    expect(cal.getEvents()).toHaveLength(1);
    expect(cal.getEvent("e1")?.title).toBe("from server");
  });

  it("addEvent optimistically applies + calls adapter.create", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const create = vi.fn(async () => undefined);
    const cal = new Calendar(root, { date: new Date(2026, 4, 13), data: { create } });
    cal.render();
    cal.addEvent({ id: "e1", title: "x", start: "2026-05-13T10:00" });
    expect(cal.getEvents()).toHaveLength(1); // optimistic
    await flush();
    expect(create).toHaveBeenCalledOnce();
  });

  it("addEvent rolls back when adapter.create rejects and emits dataError", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const create = vi.fn(async () => {
      throw new Error("server down");
    });
    const cal = new Calendar(root, { date: new Date(2026, 4, 13), data: { create } });
    cal.render();
    const errs: unknown[] = [];
    cal.on("dataError", (e) => {
      errs.push(e);
    });

    cal.addEvent({ id: "e1", title: "x", start: "2026-05-13T10:00" });
    expect(cal.getEvents()).toHaveLength(1);
    await flush();
    expect(cal.getEvents()).toHaveLength(0); // rolled back
    expect(errs).toHaveLength(1);
  });

  it("removeEvent rolls back on adapter.delete failure", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const del = vi.fn(async () => {
      throw new Error("nope");
    });
    const cal = new Calendar(root, {
      date: new Date(2026, 4, 13),
      events: [{ id: "e1", title: "x", start: "2026-05-13T10:00" }],
      data: { delete: del },
    });
    cal.render();
    cal.removeEvent("e1");
    expect(cal.getEvents()).toHaveLength(0);
    await flush();
    expect(cal.getEvents()).toHaveLength(1); // restored
  });

  it("updateEvent rolls back on adapter.update failure", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const update = vi.fn(async () => {
      throw new Error("nope");
    });
    const cal = new Calendar(root, {
      date: new Date(2026, 4, 13),
      events: [{ id: "e1", title: "before", start: "2026-05-13T10:00" }],
      data: { update },
    });
    cal.render();
    cal.updateEvent("e1", { title: "after" });
    expect(cal.getEvent("e1")?.title).toBe("after");
    await flush();
    expect(cal.getEvent("e1")?.title).toBe("before");
  });

  it("dataError carries the op name", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const cal = new Calendar(root, {
      data: {
        create: async () => {
          throw new Error("x");
        },
      },
    });
    cal.render();
    const errs: Array<{ op: string }> = [];
    cal.on("dataError", (e) => {
      errs.push(e as { op: string });
    });
    cal.addEvent({ id: "e1", title: "x", start: "2026-05-13T10:00" });
    await flush();
    expect(errs[0]?.op).toBe("create");
  });
});

async function flush() {
  // Pump microtasks a few times to let optimistic + adapter promises settle.
  for (let i = 0; i < 6; i++) await Promise.resolve();
}
