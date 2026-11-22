import { describe, expect, it, vi } from "vitest";
import {
  createLongPress,
  LONG_PRESS_MS,
  MOVE_TOLERANCE_PX,
  Timers,
} from "../src/platform/touch";

function fakeTimers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const timers: Timers = {
    set: (fn, ms) => {
      pending.set(next, { fn, ms });
      return next++;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  return {
    timers,
    pending,
    runAll: () => [...pending.values()].forEach((t) => t.fn()),
  };
}

describe("long press tracker", () => {
  it("uses 500 ms and a 10 px tolerance", () => {
    expect(LONG_PRESS_MS).toBe(500);
    expect(MOVE_TOLERANCE_PX).toBe(10);
  });

  it("fires at the touch point and swallows the following click", () => {
    const t = fakeTimers();
    const onFire = vi.fn();
    const press = createLongPress<string>(onFire, t.timers);
    press.start(40, 60, "entry");
    expect([...t.pending.values()][0].ms).toBe(500);
    t.runAll();
    expect(onFire).toHaveBeenCalledWith(40, 60, "entry");
    expect(press.end()).toBe(true);
    expect(press.end()).toBe(false);
  });

  it("does not fire when the finger lifts early", () => {
    const t = fakeTimers();
    const onFire = vi.fn();
    const press = createLongPress<string>(onFire, t.timers);
    press.start(0, 0, "entry");
    expect(press.end()).toBe(false);
    t.runAll();
    expect(onFire).not.toHaveBeenCalled();
  });

  it("cancels when the finger moves past the tolerance", () => {
    const t = fakeTimers();
    const onFire = vi.fn();
    const press = createLongPress<string>(onFire, t.timers);
    press.start(0, 0, "entry");
    press.move(6, 6);
    expect(t.pending.size).toBe(1);
    press.move(8, 8);
    expect(t.pending.size).toBe(0);
    expect(press.end()).toBe(false);
    expect(onFire).not.toHaveBeenCalled();
  });
});