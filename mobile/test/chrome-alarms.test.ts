import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlarms } from "../src/chrome/alarms";

describe("chrome.alarms shim", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the listener when the delay has passed", () => {
    const alarms = createAlarms();
    const listener = vi.fn();
    alarms.onAlarm.addListener(listener);
    alarms.create("autolock", { delayInMinutes: 2 });
    vi.advanceTimersByTime(119_000);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].name).toBe("autolock");
    vi.advanceTimersByTime(600_000);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not fire a cleared alarm", async () => {
    const alarms = createAlarms();
    const listener = vi.fn();
    alarms.onAlarm.addListener(listener);
    alarms.create("autolock", { delayInMinutes: 1 });
    await expect(alarms.clear("autolock")).resolves.toBe(true);
    vi.advanceTimersByTime(120_000);
    expect(listener).not.toHaveBeenCalled();
  });

  it("restarting an alarm replaces the previous schedule", () => {
    const alarms = createAlarms();
    const listener = vi.fn();
    alarms.onAlarm.addListener(listener);
    alarms.create("autolock", { delayInMinutes: 1 });
    vi.advanceTimersByTime(50_000);
    alarms.create("autolock", { delayInMinutes: 1 });
    vi.advanceTimersByTime(50_000);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(11_000);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("repeats a periodic alarm", () => {
    const alarms = createAlarms();
    const listener = vi.fn();
    alarms.onAlarm.addListener(listener);
    alarms.create("tick", { periodInMinutes: 1 });
    vi.advanceTimersByTime(181_000);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});