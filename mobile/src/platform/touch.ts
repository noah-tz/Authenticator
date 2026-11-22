export const LONG_PRESS_MS = 500;
export const MOVE_TOLERANCE_PX = 10;

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// Pure long-press tracker: fires `onFire` once when a touch stays within the
// tolerance for the whole delay. Used with DOM touch events below, and
// testable without a DOM.
export function createLongPress<T>(
  onFire: (x: number, y: number, target: T) => void,
  timers: Timers = realTimers,
  delay = LONG_PRESS_MS,
  tolerance = MOVE_TOLERANCE_PX
) {
  let handle: unknown;
  let startX = 0;
  let startY = 0;
  let fired = false;
  function cancel(): void {
    if (handle !== undefined) {
      timers.clear(handle);
      handle = undefined;
    }
  }
  return {
    start(x: number, y: number, target: T): void {
      cancel();
      fired = false;
      startX = x;
      startY = y;
      handle = timers.set(() => {
        handle = undefined;
        fired = true;
        onFire(startX, startY, target);
      }, delay);
    },
    move(x: number, y: number): void {
      if (Math.hypot(x - startX, y - startY) > tolerance) {
        cancel();
      }
    },
    // true when this touch was a long press, so the click that follows must
    // be swallowed
    end(): boolean {
      cancel();
      const wasLong = fired;
      fired = false;
      return wasLong;
    },
  };
}

// Long-press on an entry opens the same context menu a right-click opens in
// the extension (EntryComponent.openContextMenu), and the click that follows
// the press is suppressed.
export function installLongPress(doc: Document = document): void {
  let swallowClickUntil = 0;
  const press = createLongPress<Element>((x, y, target) => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 2,
      })
    );
  });
  doc.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      const target = (e.target as Element | null)?.closest?.(".entry");
      if (e.touches.length === 1 && touch && target) {
        press.start(touch.clientX, touch.clientY, target);
      }
    },
    { passive: true }
  );
  doc.addEventListener(
    "touchmove",
    (e) => {
      const touch = e.touches[0];
      if (touch) {
        press.move(touch.clientX, touch.clientY);
      }
    },
    { passive: true }
  );
  const finish = (e: Event) => {
    if (press.end()) {
      swallowClickUntil = Date.now() + 700;
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  };
  doc.addEventListener("touchend", finish);
  doc.addEventListener("touchcancel", finish);
  doc.addEventListener(
    "click",
    (e) => {
      if (Date.now() < swallowClickUntil) {
        swallowClickUntil = 0;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
}
