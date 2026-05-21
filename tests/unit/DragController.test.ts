import { afterEach, describe, expect, it, vi } from "vitest";
import { startDrag } from "../../src/dnd/DragController.js";

function mkPointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  opts: {
    pointerId?: number;
    clientX?: number;
    clientY?: number;
  },
): PointerEvent {
  return new PointerEvent(type, {
    pointerId: opts.pointerId ?? 1,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    bubbles: true,
    cancelable: true,
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("startDrag", () => {
  it("does not fire onStart/onMove until threshold is crossed", () => {
    const source = document.createElement("div");
    document.body.appendChild(source);
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();

    startDrag({
      origin: mkPointer("pointerdown", { clientX: 0, clientY: 0 }),
      source,
      onStart,
      onMove,
      onEnd,
    });

    window.dispatchEvent(mkPointer("pointermove", { clientX: 2, clientY: 1 }));
    expect(onStart).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("fires onStart once after threshold and onMove on subsequent moves", () => {
    const source = document.createElement("div");
    document.body.appendChild(source);
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();

    startDrag({
      origin: mkPointer("pointerdown", { clientX: 0, clientY: 0 }),
      source,
      onStart,
      onMove,
      onEnd,
    });

    window.dispatchEvent(mkPointer("pointermove", { clientX: 10, clientY: 0 }));
    window.dispatchEvent(mkPointer("pointermove", { clientX: 20, clientY: 0 }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onMove.mock.calls[1]?.[0]).toMatchObject({ deltaX: 20, deltaY: 0 });
  });

  it("onEnd fires with cancelled=false on pointerup", () => {
    const source = document.createElement("div");
    document.body.appendChild(source);
    const onEnd = vi.fn();

    startDrag({
      origin: mkPointer("pointerdown", { clientX: 0, clientY: 0 }),
      source,
      onMove: () => {},
      onEnd,
    });

    window.dispatchEvent(mkPointer("pointermove", { clientX: 10, clientY: 0 }));
    window.dispatchEvent(mkPointer("pointerup", { clientX: 10, clientY: 0 }));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0]?.[1]).toBe(false);
  });

  it("onEnd fires with cancelled=true on pointercancel", () => {
    const source = document.createElement("div");
    document.body.appendChild(source);
    const onEnd = vi.fn();

    startDrag({
      origin: mkPointer("pointerdown", { clientX: 0, clientY: 0 }),
      source,
      onMove: () => {},
      onEnd,
    });

    window.dispatchEvent(mkPointer("pointermove", { clientX: 10, clientY: 0 }));
    window.dispatchEvent(mkPointer("pointercancel", { clientX: 10, clientY: 0 }));
    expect(onEnd.mock.calls[0]?.[1]).toBe(true);
  });

  it("Escape cancels the drag", () => {
    const source = document.createElement("div");
    document.body.appendChild(source);
    const onEnd = vi.fn();

    startDrag({
      origin: mkPointer("pointerdown", { clientX: 0, clientY: 0 }),
      source,
      onMove: () => {},
      onEnd,
    });

    window.dispatchEvent(mkPointer("pointermove", { clientX: 10, clientY: 0 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEnd.mock.calls[0]?.[1]).toBe(true);
  });

  it("onEnd does NOT fire if drag was never started (no pointermove past threshold)", () => {
    const source = document.createElement("div");
    document.body.appendChild(source);
    const onEnd = vi.fn();

    startDrag({
      origin: mkPointer("pointerdown", { clientX: 0, clientY: 0 }),
      source,
      onMove: () => {},
      onEnd,
    });

    window.dispatchEvent(mkPointer("pointerup", { clientX: 0, clientY: 0 }));
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("ignores events from other pointerIds", () => {
    const source = document.createElement("div");
    document.body.appendChild(source);
    const onMove = vi.fn();

    startDrag({
      origin: mkPointer("pointerdown", { clientX: 0, clientY: 0, pointerId: 1 }),
      source,
      onMove,
      onEnd: () => {},
    });

    window.dispatchEvent(mkPointer("pointermove", { clientX: 100, clientY: 0, pointerId: 2 }));
    expect(onMove).not.toHaveBeenCalled();
  });

  it("manual cancel() ends the drag", () => {
    const source = document.createElement("div");
    document.body.appendChild(source);
    const onEnd = vi.fn();

    const handle = startDrag({
      origin: mkPointer("pointerdown", { clientX: 0, clientY: 0 }),
      source,
      onMove: () => {},
      onEnd,
    });

    window.dispatchEvent(mkPointer("pointermove", { clientX: 10, clientY: 0 }));
    handle.cancel();
    expect(onEnd.mock.calls[0]?.[1]).toBe(true);
  });
});
