import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import pg from "pg";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

if (!process.env.DATABASE_URL) {
  console.error("Error: DATABASE_URL is not set. Copy .env.example to .env and fill in your credentials.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workers (
      id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      skills VARCHAR(50) NOT NULL DEFAULT 'both'
    );

    CREATE TABLE IF NOT EXISTS services (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name         VARCHAR(255) NOT NULL,
      category     VARCHAR(50)  NOT NULL,
      duration_min INTEGER      NOT NULL,
      price_cents  INTEGER      NOT NULL,
      color        VARCHAR(20)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id   UUID REFERENCES workers(id) ON DELETE CASCADE,
      service_id  UUID REFERENCES services(id) ON DELETE SET NULL,
      start_iso   TIMESTAMPTZ NOT NULL,
      end_iso     TIMESTAMPTZ NOT NULL,
      client_name VARCHAR(255),
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed demo data on first run
  const { rows } = await pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM workers");
  if ((rows[0]?.n ?? 0) === 0) {
    await pool.query(`
      INSERT INTO workers (name, skills) VALUES
        ('Alex',  'both'),
        ('Blair', 'haircuts'),
        ('Casey', 'nails');

      INSERT INTO services (name, category, duration_min, price_cents, color) VALUES
        ('Haircut',          'haircuts', 30, 2500, '#4CAF50'),
        ('Color treatment',  'haircuts', 90, 6500, '#9C27B0'),
        ('Trim',             'haircuts', 15, 1500, '#2196F3'),
        ('Basic manicure',   'nails',    45, 2500, '#E91E63'),
        ('Gel nails',        'nails',    60, 4500, '#FF5722'),
        ('Nail art',         'nails',    90, 6500, '#FF9800');
    `);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps a joined appointment+service row to the RosterEvent shape the calendar expects. */
function toRosterEvent(row: Record<string, unknown>): unknown {
  const clientName = (row.client_name as string | null) ?? "";
  const serviceName = (row.service_name as string | null) ?? "Appointment";
  return {
    id:         row.id,
    title:      clientName ? `${serviceName} — ${clientName}` : serviceName,
    start:      row.start_iso,
    end:        row.end_iso,
    resourceId: row.worker_id,
    color:      row.color ?? undefined,
    extendedProps: {
      serviceId:   row.service_id,
      serviceName,
      priceCents:  row.price_cents ?? 0,
      clientName,
      notes:       (row.notes as string | null) ?? "",
    },
  };
}

const APPOINTMENT_SELECT = `
  SELECT
    a.id,
    a.worker_id,
    a.service_id,
    a.start_iso,
    a.end_iso,
    a.client_name,
    a.notes,
    s.name  AS service_name,
    s.color,
    s.price_cents
  FROM appointments a
  LEFT JOIN services s ON s.id = a.service_id
`;

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

app.use("*", cors());

// ---- Workers ---------------------------------------------------------------

app.get("/api/workers", async (c) => {
  const { rows } = await pool.query("SELECT * FROM workers ORDER BY name");
  return c.json(rows);
});

app.post("/api/workers", async (c) => {
  const body = await c.req.json<{ name: string; skills?: string }>();
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO workers (name, skills) VALUES ($1, $2) RETURNING *",
    [body.name, body.skills ?? "both"],
  );
  return c.json(rows[0], 201);
});

app.delete("/api/workers/:id", async (c) => {
  await pool.query("DELETE FROM workers WHERE id = $1", [c.req.param("id")]);
  return c.json({ ok: true });
});

// ---- Services --------------------------------------------------------------

app.get("/api/services", async (c) => {
  const { rows } = await pool.query("SELECT * FROM services ORDER BY category, name");
  return c.json(rows);
});

app.post("/api/services", async (c) => {
  const body = await c.req.json<{
    name: string;
    category: string;
    durationMin: number;
    priceCents: number;
    color?: string;
  }>();
  const { rows } = await pool.query(
    "INSERT INTO services (name, category, duration_min, price_cents, color) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [body.name, body.category, body.durationMin, body.priceCents, body.color ?? null],
  );
  return c.json(rows[0], 201);
});

app.delete("/api/services/:id", async (c) => {
  await pool.query("DELETE FROM services WHERE id = $1", [c.req.param("id")]);
  return c.json({ ok: true });
});

// ---- Appointments (mapped as RosterEvent) ----------------------------------

app.get("/api/appointments", async (c) => {
  const from = c.req.query("from");
  const to   = c.req.query("to");
  const { rows } = await pool.query(
    `${APPOINTMENT_SELECT} WHERE a.start_iso >= $1 AND a.start_iso <= $2 ORDER BY a.start_iso`,
    [from, to],
  );
  return c.json(rows.map(toRosterEvent));
});

app.post("/api/appointments", async (c) => {
  // Body is a RosterEvent as sent by the CrudAdapter
  const ev = await c.req.json<{
    id?: string;
    resourceId: string;
    start: string;
    end: string;
    extendedProps?: { serviceId?: string; clientName?: string; notes?: string };
  }>();
  const ext = ev.extendedProps ?? {};
  const { rows } = await pool.query(
    `INSERT INTO appointments (id, worker_id, service_id, start_iso, end_iso, client_name, notes)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [ev.id ?? null, ev.resourceId, ext.serviceId ?? null, ev.start, ev.end,
     ext.clientName ?? null, ext.notes ?? null],
  );
  const id = rows[0]?.id as string;
  const { rows: full } = await pool.query(`${APPOINTMENT_SELECT} WHERE a.id = $1`, [id]);
  return c.json(toRosterEvent(full[0] as Record<string, unknown>), 201);
});

app.patch("/api/appointments/:id", async (c) => {
  const id = c.req.param("id");
  const ev = await c.req.json<{
    resourceId?: string;
    start?: string;
    end?: string;
    extendedProps?: { serviceId?: string; clientName?: string; notes?: string };
  }>();
  const ext = ev.extendedProps ?? {};

  // Build a partial UPDATE — only touch fields present in the body
  const sets: string[] = [];
  const vals: unknown[] = [];
  let n = 1;

  const push = (col: string, val: unknown) => {
    sets.push(`${col} = $${n++}`);
    vals.push(val);
  };

  if (ev.resourceId !== undefined)    push("worker_id",   ev.resourceId);
  if (ev.start !== undefined)         push("start_iso",   ev.start);
  if (ev.end !== undefined)           push("end_iso",     ev.end);
  if (ext.serviceId !== undefined)    push("service_id",  ext.serviceId);
  if (ext.clientName !== undefined)   push("client_name", ext.clientName);
  if (ext.notes !== undefined)        push("notes",       ext.notes);

  if (sets.length > 0) {
    vals.push(id);
    await pool.query(`UPDATE appointments SET ${sets.join(", ")} WHERE id = $${n}`, vals);
  }

  const { rows } = await pool.query(`${APPOINTMENT_SELECT} WHERE a.id = $1`, [id]);
  return c.json(toRosterEvent(rows[0] as Record<string, unknown>));
});

app.delete("/api/appointments/:id", async (c) => {
  await pool.query("DELETE FROM appointments WHERE id = $1", [c.req.param("id")]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3001);

await initDb();
console.log(`[nail-salon] DB ready`);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[nail-salon] listening on http://localhost:${PORT}`);
});
