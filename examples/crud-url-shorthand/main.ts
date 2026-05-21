import { Calendar, type RosterEvent } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const root = document.getElementById("cal");
const logElMaybe = document.getElementById("log");
const addBtn = document.getElementById("add");
const clearBtn = document.getElementById("clear");
const failChk = document.getElementById("fail") as HTMLInputElement | null;
if (!root || !logElMaybe || !addBtn || !clearBtn || !failChk) throw new Error("missing elements");
const logEl: HTMLElement = logElMaybe;

const STORAGE_KEY = "rostercal:crud-url-shorthand:events";

function loadAll(): RosterEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RosterEvent[]) : seedEvents();
  } catch {
    return seedEvents();
  }
}

function saveAll(events: RosterEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function seedEvents(): RosterEvent[] {
  const evts: RosterEvent[] = [
    { id: "seed-1", title: "Standup", start: "2026-05-13T09:30" },
    { id: "seed-2", title: "Lunch", start: "2026-05-13T12:00" },
    { id: "seed-3", title: "1:1", start: "2026-05-14T14:00" },
  ];
  saveAll(evts);
  return evts;
}

function log(msg: string) {
  const stamp = new Date().toLocaleTimeString();
  logEl.textContent = `[${stamp}] ${msg}\n${logEl.textContent ?? ""}`;
}

// A fetcher that pretends to be a REST server. Routes requests to localStorage.
const fakeFetcher: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(init.body as string) : null;

  log(`${method} ${url}`);

  if (failChk.checked && method !== "GET") {
    await sleep(150);
    return new Response("simulated failure", { status: 500 });
  }
  await sleep(150);

  // GET /api/events?from=…&to=…  → list
  if (method === "GET" && url.startsWith("/api/events?")) {
    return jsonResponse(loadAll());
  }

  // POST /api/events  → create
  if (method === "POST" && url === "/api/events") {
    const evts = loadAll();
    evts.push(body as RosterEvent);
    saveAll(evts);
    return jsonResponse(body, 201);
  }

  // PATCH /api/events/:id  → update
  if (method === "PATCH" && url.startsWith("/api/events/")) {
    const id = decodeURIComponent(url.slice("/api/events/".length));
    const evts = loadAll();
    const idx = evts.findIndex((e) => e.id === id);
    if (idx === -1) return new Response("not found", { status: 404 });
    evts[idx] = body as RosterEvent;
    saveAll(evts);
    return jsonResponse(body);
  }

  // DELETE /api/events/:id
  if (method === "DELETE" && url.startsWith("/api/events/")) {
    const id = decodeURIComponent(url.slice("/api/events/".length));
    const evts = loadAll().filter((e) => e.id !== id);
    saveAll(evts);
    return new Response(null, { status: 204 });
  }

  return new Response("no route", { status: 404 });
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const cal = new Calendar(root, {
  date: new Date(2026, 4, 13),
  data: {
    list: "GET /api/events?from=:from&to=:to",
    create: "POST /api/events",
    update: "PATCH /api/events/:id",
    delete: "DELETE /api/events/:id",
    fetcher: fakeFetcher,
  },
});

cal.render();

cal.on("dataError", ({ op, error }) => {
  log(`✗ dataError on ${op}: ${(error as Error).message ?? String(error)}`);
});

addBtn.addEventListener("click", () => {
  const id = `e-${Date.now()}`;
  cal.addEvent({ id, title: "New appointment", start: "2026-05-15T10:00" });
});

clearBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  log("cleared localStorage; reloading from adapter…");
  // Re-trigger list by calling setDate to the current date.
  cal.setDate(cal.getDate());
});
