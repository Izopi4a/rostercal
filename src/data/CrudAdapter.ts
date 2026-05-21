import type { CrudAdapter, OpString, RosterEvent } from "../core/types.js";

const METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i;

export interface ParsedOpString {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  urlTemplate: string;
}

export function parseOpString(op: OpString): ParsedOpString {
  const m = METHOD_RE.exec(op);
  if (!m?.[1] || !m[2]) {
    throw new TypeError(`Invalid op string "${op}" — expected '<METHOD> <url>'`);
  }
  return { method: m[1].toUpperCase() as ParsedOpString["method"], urlTemplate: m[2] };
}

export interface TemplateParams {
  id?: string;
  from?: Date;
  to?: Date;
}

/**
 * Substitutes `:id`, `:from`, `:to` placeholders in a URL template. Dates are
 * rendered as ISO strings (with full timestamp). Unknown placeholders are left
 * intact — the user can include their own and provide a custom fetcher.
 */
export function applyUrlTemplate(template: string, params: TemplateParams): string {
  return template.replace(/:(id|from|to)/g, (full, key) => {
    if (key === "id") return params.id !== undefined ? encodeURIComponent(params.id) : full;
    if (key === "from") return params.from ? params.from.toISOString() : full;
    if (key === "to") return params.to ? params.to.toISOString() : full;
    return full;
  });
}

/**
 * Runtime wrapper around a CrudAdapter config. Hides the OpString vs. function
 * polymorphism: callers just await `list`/`create`/`update`/`delete` and get a
 * parsed result back.
 */
export class CrudController {
  constructor(private readonly config: CrudAdapter) {}

  get optimistic(): boolean {
    return this.config.optimistic ?? true;
  }

  hasList(): boolean {
    return this.config.list !== undefined;
  }
  hasCreate(): boolean {
    return this.config.create !== undefined;
  }
  hasUpdate(): boolean {
    return this.config.update !== undefined;
  }
  hasDelete(): boolean {
    return this.config.delete !== undefined;
  }

  async list(range: { from: Date; to: Date }): Promise<RosterEvent[]> {
    if (this.config.list === undefined) return [];
    const raw =
      typeof this.config.list === "string"
        ? await this.callOp(this.config.list, { from: range.from, to: range.to })
        : await this.config.list(range);
    return this.parseListResponse(raw);
  }

  async create(event: RosterEvent): Promise<void> {
    if (this.config.create === undefined) return;
    const body = this.toServer(event);
    if (typeof this.config.create === "string") {
      await this.callOp(this.config.create, { id: event.id }, body);
    } else {
      await this.config.create(event);
    }
  }

  async update(event: RosterEvent): Promise<void> {
    if (this.config.update === undefined) return;
    const body = this.toServer(event);
    if (typeof this.config.update === "string") {
      await this.callOp(this.config.update, { id: event.id }, body);
    } else {
      await this.config.update(event);
    }
  }

  async delete(id: string): Promise<void> {
    if (this.config.delete === undefined) return;
    if (typeof this.config.delete === "string") {
      await this.callOp(this.config.delete, { id });
    } else {
      await this.config.delete(id);
    }
  }

  // --- internals ---

  private toServer(event: RosterEvent): unknown {
    return this.config.toServer ? this.config.toServer(event) : event;
  }

  private parseListResponse(raw: unknown): RosterEvent[] {
    if (this.config.fromServer) {
      const out = this.config.fromServer(raw);
      return Array.isArray(out) ? out : [out];
    }
    if (Array.isArray(raw)) return raw as RosterEvent[];
    if (raw && typeof raw === "object") return [raw as RosterEvent];
    throw new TypeError("list response is not an array of events; provide fromServer() to map it");
  }

  private async callOp(op: OpString, params: TemplateParams, body?: unknown): Promise<unknown> {
    const { method, urlTemplate } = parseOpString(op);
    const url = applyUrlTemplate(urlTemplate, params);
    const init: RequestInit = { method };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const fetcher = this.config.fetcher ?? globalThis.fetch.bind(globalThis);
    const res = await fetcher(url, init);
    if (!res.ok) {
      throw new Error(`${method} ${url} → ${res.status} ${res.statusText}`);
    }
    if (method === "DELETE" || res.status === 204) return undefined;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) return res.json();
    return undefined;
  }
}
