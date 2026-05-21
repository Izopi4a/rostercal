import { Calendar, type RosterEvent } from "@izopi4a/rostercal";
import "@izopi4a/rostercal/styles";

// Change this to point at Go or PHP backends when you run them instead.
// @ts-expect-error Vite injects import.meta.env at build time
const API = (import.meta.env?.VITE_API_BASE as string | undefined) ?? "http://localhost:3001";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Worker {
  id: string;
  name: string;
  skills: "haircuts" | "nails" | "both";
}

interface Service {
  id: string;
  name: string;
  category: "haircuts" | "nails";
  duration_min: number;
  price_cents: number;
  color: string | null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  if (res.status === 204 || init?.method === "DELETE") return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let workers: Worker[] = [];
let services: Service[] = [];
let currentDate = new Date();

// The service currently being dragged (set on dragstart, cleared on dragend).
let draggingService: Service | null = null;

// The event currently open in the appointment dialog.
let openEventId: string | null = null;

// Slot targeted by the "+" button, waiting for service selection.
let pendingSlot: { date: Date; resourceId: string } | null = null;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function input(id: string): HTMLInputElement {
  return getEl(id) as HTMLInputElement;
}

function select(id: string): HTMLSelectElement {
  return getEl(id) as HTMLSelectElement;
}

function openDialog(id: string): void {
  (getEl(id) as HTMLDialogElement).showModal();
}

function closeDialog(id: string): void {
  (getEl(id) as HTMLDialogElement).close();
}

// Close on data-close buttons
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = (btn as HTMLElement).dataset.close;
    if (id) closeDialog(id);
  });
});

// Close dialog on backdrop click
document.querySelectorAll("dialog").forEach((dlg) => {
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
});

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Render sidebar
// ---------------------------------------------------------------------------

function renderWorkers(): void {
  const list = getEl("worker-list");
  list.innerHTML = "";
  if (workers.length === 0) {
    list.innerHTML = '<p style="font-size:0.8rem;color:#aaa;margin:0">No workers yet.</p>';
    return;
  }
  for (const w of workers) {
    const item = document.createElement("div");
    item.className = "worker-item";
    const badge = w.skills === "both" ? "✂ + 💅" : w.skills === "haircuts" ? "✂" : "💅";
    item.innerHTML = `
      <span class="worker-name">${w.name}</span>
      <span class="skills-badge">${badge}</span>
      <button type="button" class="delete-btn" data-worker-id="${w.id}" title="Remove">✕</button>
    `;
    list.appendChild(item);
  }

  list.querySelectorAll("[data-worker-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = (btn as HTMLElement).dataset.workerId;
      if (!id) return;
      await apiFetch(`/api/workers/${id}`, { method: "DELETE" });
      workers = workers.filter((w) => w.id !== id);
      renderWorkers();
      rebuildCalendar();
    });
  });
}

function renderServices(): void {
  const haircuts = getEl("service-list-haircuts");
  const nails = getEl("service-list-nails");
  haircuts.innerHTML = "";
  nails.innerHTML = "";

  for (const svc of services) {
    const card = document.createElement("div");
    card.className = "service-card";
    card.draggable = true;
    card.dataset.serviceId = svc.id;
    card.innerHTML = `
      <span class="svc-dot" style="background:${svc.color ?? "#aaa"}"></span>
      <span class="svc-name">${svc.name}</span>
      <span class="svc-meta">${svc.duration_min}min · ${fmtPrice(svc.price_cents)}</span>
      <button type="button" class="delete-btn" data-service-id="${svc.id}" title="Remove">✕</button>
    `;

    card.addEventListener("dragstart", (e) => {
      draggingService = svc;
      e.dataTransfer?.setData("text/plain", svc.id);
    });
    card.addEventListener("dragend", () => {
      draggingService = null;
    });

    (svc.category === "haircuts" ? haircuts : nails).appendChild(card);
  }

  // Delete service buttons
  document.querySelectorAll<HTMLElement>("button[data-service-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.serviceId;
      if (!id) return;
      await apiFetch(`/api/services/${id}`, { method: "DELETE" });
      services = services.filter((s) => s.id !== id);
      renderServices();
    });
  });
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

let cal: Calendar;

function buildDateLabel(): void {
  getEl("date-label").textContent = fmtDate(currentDate);
}

function rebuildCalendar(): void {
  cal?.destroy();
  cal = new Calendar(getEl("cal"), {
    view: "resource-time-grid",
    date: currentDate,
    dnd: true,
    resources: workers.map((w) => ({ id: w.id, title: w.name })),
    hour12: false,
    data: {
      list: `GET ${API}/api/appointments?from=:from&to=:to`,
      create: `POST ${API}/api/appointments`,
      update: `PATCH ${API}/api/appointments/:id`,
      delete: `DELETE ${API}/api/appointments/:id`,
    },

    // Append a price badge to every rendered appointment.
    eventDidMount({ event, el }) {
      const cents = (event.extendedProps as { priceCents?: number } | undefined)?.priceCents;
      if (!cents) return;
      const badge = document.createElement("span");
      badge.textContent = fmtPrice(cents);
      badge.style.cssText = "position:absolute;bottom:3px;right:5px;font-size:0.6rem;opacity:0.85;";
      el.appendChild(badge);
    },

    // Show a "+" button on every empty slot; clicking opens the service picker.
    slotDidMount({ date: slotDate, resourceId: slotResource, el: slotEl }) {
      if (services.length === 0) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rc-rtg__slot-add";
      btn.textContent = "+";
      btn.title = "New appointment";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        pendingSlot = { date: slotDate, resourceId: slotResource };
        (getEl("dlg-pick-service") as HTMLDialogElement).showModal();
      });
      slotEl.appendChild(btn);
    },
  });

  cal.on("externalDrop", ({ date, resourceId }) => {
    const svc = draggingService;
    if (!svc) return;
    const end = new Date(date.getTime() + svc.duration_min * 60_000);
    const event: RosterEvent = {
      id: crypto.randomUUID(),
      title: svc.name,
      start: date,
      end,
      resourceId,
      ...(svc.color ? { color: svc.color } : {}),
      extendedProps: {
        serviceId: svc.id,
        serviceName: svc.name,
        priceCents: svc.price_cents,
        clientName: "",
        notes: "",
      },
    };
    cal.addEvent(event);
    // Open the appointment modal so the user can fill in the client name right away.
    openAppointmentModal(event);
  });

  cal.on("eventClick", ({ event }) => {
    openAppointmentModal(event);
  });

  cal.on("dataError", ({ op, error }) => {
    console.error(`[nail-salon] CRUD error on "${op}":`, error);
  });

  cal.render();
}

// ---------------------------------------------------------------------------
// Appointment modal
// ---------------------------------------------------------------------------

function openAppointmentModal(event: RosterEvent): void {
  openEventId = event.id;
  const ext = (event.extendedProps ?? {}) as {
    serviceName?: string;
    priceCents?: number;
    clientName?: string;
    notes?: string;
  };

  const worker = workers.find((w) => w.id === event.resourceId);
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;

  getEl("dlg-appt-title").textContent = ext.serviceName ?? event.title;
  getEl("dlg-appt-meta").innerHTML = [
    `<strong>Worker:</strong> ${worker?.name ?? event.resourceId}`,
    `<strong>Time:</strong> ${fmtTime(start)}${end ? ` – ${fmtTime(end)}` : ""}`,
    ext.priceCents ? `<strong>Price:</strong> ${fmtPrice(ext.priceCents)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");

  input("appt-client").value = ext.clientName ?? "";
  (getEl("appt-notes") as HTMLTextAreaElement).value = ext.notes ?? "";

  openDialog("dlg-appointment");
}

getEl("btn-save-appt").addEventListener("click", () => {
  if (!openEventId) return;
  const clientName = input("appt-client").value.trim();
  const notes = (getEl("appt-notes") as HTMLTextAreaElement).value.trim();
  const event = cal.getEvent(openEventId);
  if (!event) return;

  const updated: Partial<RosterEvent> = {
    extendedProps: { ...(event.extendedProps ?? {}), clientName, notes },
  };
  // Recompute title to include client name
  const serviceName =
    (event.extendedProps as { serviceName?: string } | undefined)?.serviceName ?? event.title;
  updated.title = clientName ? `${serviceName} — ${clientName}` : serviceName;

  cal.updateEvent(openEventId, updated);
  closeDialog("dlg-appointment");
  openEventId = null;
});

getEl("btn-delete-appt").addEventListener("click", () => {
  if (!openEventId) return;
  cal.removeEvent(openEventId);
  closeDialog("dlg-appointment");
  openEventId = null;
});

// ---------------------------------------------------------------------------
// Service picker (slot "+" button)
// ---------------------------------------------------------------------------

function populateServicePicker(): void {
  const sel = select("pick-service-select");
  sel.innerHTML = "";
  for (const svc of services) {
    const opt = document.createElement("option");
    opt.value = svc.id;
    opt.textContent = `${svc.name} (${svc.duration_min}min · ${fmtPrice(svc.price_cents)})`;
    sel.appendChild(opt);
  }
}

// Re-populate whenever the dialog opens so newly-added services appear.
(getEl("dlg-pick-service") as HTMLDialogElement).addEventListener("toggle", (e) => {
  if ((e as ToggleEvent).newState === "open") populateServicePicker();
});

getEl("btn-confirm-service").addEventListener("click", () => {
  if (!pendingSlot) return;
  const svcId = select("pick-service-select").value;
  const svc = services.find((s) => s.id === svcId);
  if (!svc) return;

  const { date, resourceId } = pendingSlot;
  const end = new Date(date.getTime() + svc.duration_min * 60_000);
  const event: RosterEvent = {
    id: crypto.randomUUID(),
    title: svc.name,
    start: date,
    end,
    resourceId,
    ...(svc.color ? { color: svc.color } : {}),
    extendedProps: {
      serviceId: svc.id,
      serviceName: svc.name,
      priceCents: svc.price_cents,
      clientName: "",
      notes: "",
    },
  };
  cal.addEvent(event);
  closeDialog("dlg-pick-service");
  pendingSlot = null;
  openAppointmentModal(event);
});

// ---------------------------------------------------------------------------
// Add worker
// ---------------------------------------------------------------------------

getEl("btn-add-worker").addEventListener("click", () => {
  input("worker-name").value = "";
  select("worker-skills").value = "both";
  openDialog("dlg-add-worker");
});

getEl("btn-save-worker").addEventListener("click", async () => {
  const name = input("worker-name").value.trim();
  if (!name) return;
  const skills = select("worker-skills").value;
  const worker = await apiFetch<Worker>("/api/workers", {
    method: "POST",
    body: JSON.stringify({ name, skills }),
  });
  workers.push(worker);
  renderWorkers();
  rebuildCalendar();
  closeDialog("dlg-add-worker");
});

// ---------------------------------------------------------------------------
// Add service
// ---------------------------------------------------------------------------

getEl("btn-add-service").addEventListener("click", () => {
  input("svc-name").value = "";
  input("svc-duration").value = "30";
  input("svc-price").value = "25";
  input("svc-color").value = "#2b7fff";
  select("svc-category").value = "haircuts";
  openDialog("dlg-add-service");
});

getEl("btn-save-service").addEventListener("click", async () => {
  const name = input("svc-name").value.trim();
  if (!name) return;
  const svc = await apiFetch<Service>("/api/services", {
    method: "POST",
    body: JSON.stringify({
      name,
      category: select("svc-category").value,
      durationMin: Number(input("svc-duration").value),
      priceCents: Math.round(Number(input("svc-price").value) * 100),
      color: input("svc-color").value,
    }),
  });
  services.push(svc);
  renderServices();
  closeDialog("dlg-add-service");
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

getEl("btn-prev").addEventListener("click", () => {
  currentDate = new Date(currentDate);
  currentDate.setDate(currentDate.getDate() - 1);
  buildDateLabel();
  cal.setDate(currentDate);
});

getEl("btn-next").addEventListener("click", () => {
  currentDate = new Date(currentDate);
  currentDate.setDate(currentDate.getDate() + 1);
  buildDateLabel();
  cal.setDate(currentDate);
});

getEl("btn-today").addEventListener("click", () => {
  currentDate = new Date();
  buildDateLabel();
  cal.setDate(currentDate);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot(): Promise<void> {
  [workers, services] = await Promise.all([
    apiFetch<Worker[]>("/api/workers"),
    apiFetch<Service[]>("/api/services"),
  ]);

  renderWorkers();
  renderServices();
  buildDateLabel();
  rebuildCalendar();
}

boot().catch(console.error);
