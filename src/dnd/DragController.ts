/**
 * Pointer-Events drag controller. Handles the lifecycle:
 *   pointerdown → (threshold) → dragStart → pointermove* → pointerup/cancel → end
 *
 * Works for mouse, touch, and pen uniformly. The original pointer is captured
 * on the source element so the gesture survives the pointer leaving the
 * element's box.
 */

export interface DragInfo {
  /** The initial pointerdown event. */
  readonly origin: PointerEvent;
  /** The element the pointerdown happened on. */
  readonly source: HTMLElement;
  /** Most recent pointer position relative to the viewport. */
  clientX: number;
  clientY: number;
  /** Pixel delta from origin. */
  deltaX: number;
  deltaY: number;
}

export interface DragSpec {
  /** The pointerdown event that initiated the gesture. */
  origin: PointerEvent;
  /** The element the gesture is acting on (for pointer capture). */
  source: HTMLElement;
  /** Pixel distance after which dragging is considered to have started. Default 4. */
  thresholdPx?: number;
  /** Called once after the threshold is crossed (the gesture is committed to a drag). */
  onStart?: (info: DragInfo) => void;
  /** Called for every pointermove past the threshold. */
  onMove: (info: DragInfo) => void;
  /** Called on pointerup or cancel. `cancelled=true` for pointercancel or Escape. */
  onEnd: (info: DragInfo, cancelled: boolean) => void;
}

/** Starts a drag gesture. Returns a handle exposing `cancel()` for callers. */
export function startDrag(spec: DragSpec): { cancel: () => void } {
  const threshold = spec.thresholdPx ?? 4;
  const info: DragInfo = {
    origin: spec.origin,
    source: spec.source,
    clientX: spec.origin.clientX,
    clientY: spec.origin.clientY,
    deltaX: 0,
    deltaY: 0,
  };
  let started = false;
  let ended = false;

  const pointerId = spec.origin.pointerId;
  try {
    spec.source.setPointerCapture(pointerId);
  } catch {
    // setPointerCapture can throw if pointerId is invalid; ignore — gesture still works without capture.
  }

  function finish(cancelled: boolean) {
    if (ended) return;
    ended = true;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKeydown);
    try {
      spec.source.releasePointerCapture(pointerId);
    } catch {
      // already released
    }
    if (started) spec.onEnd(info, cancelled);
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    info.clientX = e.clientX;
    info.clientY = e.clientY;
    info.deltaX = e.clientX - spec.origin.clientX;
    info.deltaY = e.clientY - spec.origin.clientY;
    if (!started) {
      const dist = Math.hypot(info.deltaX, info.deltaY);
      if (dist < threshold) return;
      started = true;
      spec.onStart?.(info);
    }
    spec.onMove(info);
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    finish(false);
  }

  function onCancel(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    finish(true);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") finish(true);
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKeydown);

  return { cancel: () => finish(true) };
}

/**
 * Hit-test the element under the given viewport coordinates and walk up to find
 * the first ancestor with a `data-date` attribute. Returns null if none found.
 */
export function hitTestDateCell(x: number, y: number): { date: Date; cell: HTMLElement } | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cell = (el as HTMLElement).closest<HTMLElement>("[data-date]");
  if (!cell) return null;
  const value = cell.dataset.date;
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return { date, cell };
}
