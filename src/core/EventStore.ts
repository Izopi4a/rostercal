import type { Resource, RosterEvent } from "./types.js";

export class EventStore {
  private events = new Map<string, RosterEvent>();

  constructor(initial: RosterEvent[] = []) {
    for (const e of initial) {
      if (this.events.has(e.id)) {
        throw new Error(`Duplicate event id "${e.id}" in initial events`);
      }
      this.events.set(e.id, e);
    }
  }

  add(event: RosterEvent): RosterEvent {
    if (this.events.has(event.id)) {
      throw new Error(`Event id "${event.id}" already exists`);
    }
    this.events.set(event.id, event);
    return event;
  }

  update(id: string, patch: Partial<RosterEvent>): RosterEvent {
    const current = this.events.get(id);
    if (!current) throw new Error(`Event "${id}" not found`);
    // Id is immutable through patches; if provided it must match.
    if (patch.id !== undefined && patch.id !== id) {
      throw new Error(`Event id cannot be changed (got "${patch.id}" for "${id}")`);
    }
    const merged: RosterEvent = { ...current, ...patch, id };
    this.events.set(id, merged);
    return merged;
  }

  remove(id: string): void {
    if (!this.events.has(id)) throw new Error(`Event "${id}" not found`);
    this.events.delete(id);
  }

  get(id: string): RosterEvent | undefined {
    return this.events.get(id);
  }

  list(): RosterEvent[] {
    return [...this.events.values()];
  }

  size(): number {
    return this.events.size;
  }

  clear(): void {
    this.events.clear();
  }
}

export class ResourceStore {
  private resources = new Map<string, Resource>();

  constructor(initial: Resource[] = []) {
    for (const r of initial) {
      if (this.resources.has(r.id)) {
        throw new Error(`Duplicate resource id "${r.id}" in initial resources`);
      }
      this.resources.set(r.id, r);
    }
  }

  add(resource: Resource): Resource {
    if (this.resources.has(resource.id)) {
      throw new Error(`Resource id "${resource.id}" already exists`);
    }
    this.resources.set(resource.id, resource);
    return resource;
  }

  remove(id: string): void {
    if (!this.resources.has(id)) throw new Error(`Resource "${id}" not found`);
    this.resources.delete(id);
  }

  list(): Resource[] {
    const items = [...this.resources.values()];
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return items;
  }
}
