import { Calendar, type RosterEvent } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

const root = document.getElementById("cal");
const logElMaybe = document.getElementById("log");
const addBtn = document.getElementById("add");
if (!root || !logElMaybe || !addBtn) throw new Error("missing elements");
const logEl: HTMLElement = logElMaybe;

function log(msg: string) {
  const stamp = new Date().toLocaleTimeString();
  logEl.textContent = `[${stamp}] ${msg}\n${logEl.textContent ?? ""}`;
}

// Pretend backend. DTO shape differs from RosterEvent intentionally — this is
// the whole point of the function form + transformers.
interface BackendEventDTO {
  uuid: string;
  name: string;
  at: string;
  untilAt?: string;
}

const backend = new Map<string, BackendEventDTO>([
  [
    "seed-1",
    { uuid: "seed-1", name: "Onboarding", at: "2026-05-13T10:00", untilAt: "2026-05-13T11:00" },
  ],
  [
    "seed-2",
    { uuid: "seed-2", name: "Retro", at: "2026-05-14T15:00", untilAt: "2026-05-14T16:00" },
  ],
]);

const customClient = {
  async list(range: { from: Date; to: Date }) {
    log(`client.list(${range.from.toLocaleDateString()} → ${range.to.toLocaleDateString()})`);
    await sleep(120);
    return [...backend.values()];
  },
  async create(dto: BackendEventDTO) {
    log(`client.create(${dto.uuid})`);
    await sleep(120);
    backend.set(dto.uuid, dto);
  },
  async update(dto: BackendEventDTO) {
    log(`client.update(${dto.uuid})`);
    await sleep(120);
    backend.set(dto.uuid, dto);
  },
  async delete(id: string) {
    log(`client.delete(${id})`);
    await sleep(120);
    backend.delete(id);
  },
};

function fromDto(dto: BackendEventDTO): RosterEvent {
  return {
    id: dto.uuid,
    title: dto.name,
    start: dto.at,
    ...(dto.untilAt ? { end: dto.untilAt } : {}),
  };
}

function toDto(e: RosterEvent): BackendEventDTO {
  return {
    uuid: e.id,
    name: e.title,
    at: typeof e.start === "string" ? e.start : e.start.toISOString(),
    ...(e.end ? { untilAt: typeof e.end === "string" ? e.end : e.end.toISOString() } : {}),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const cal = new Calendar(root, {
  date: new Date(2026, 4, 13),
  data: {
    list: (range) => customClient.list(range),
    create: (event) => customClient.create(toDto(event)),
    update: (event) => customClient.update(toDto(event)),
    delete: (id) => customClient.delete(id),
    fromServer: (raw) => {
      const arr = raw as BackendEventDTO[];
      return arr.map(fromDto);
    },
  },
});

cal.render();

cal.on("dataError", ({ op, error }) => {
  log(`✗ dataError on ${op}: ${(error as Error).message ?? String(error)}`);
});

addBtn.addEventListener("click", () => {
  const id = `e-${Date.now()}`;
  cal.addEvent({ id, title: "New event", start: "2026-05-15T11:00", end: "2026-05-15T12:00" });
});
