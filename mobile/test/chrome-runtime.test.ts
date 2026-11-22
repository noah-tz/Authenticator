import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntime } from "../src/chrome/runtime";

describe("chrome.runtime shim", () => {
  let runtime: ReturnType<typeof createRuntime>;
  beforeEach(() => {
    runtime = createRuntime({ version: "1.0.2" });
    ((globalThis as unknown) as { chrome: unknown }).chrome = { runtime };
  });

  it("dispatches to listeners and resolves with a synchronous response", async () => {
    const listener = vi.fn((message, _sender, sendResponse) => {
      sendResponse({ echo: message });
    });
    runtime.onMessage.addListener(listener);
    await expect(runtime.sendMessage({ action: "ping" })).resolves.toEqual({
      echo: { action: "ping" },
    });
    runtime.onMessage.removeListener(listener);
  });

  it("keeps the channel open when a listener returns true", async () => {
    const listener = (
      _m: unknown,
      _s: unknown,
      sendResponse: (r?: unknown) => void
    ) => {
      setTimeout(() => sendResponse("late"), 10);
      return true;
    };
    runtime.onMessage.addListener(listener);
    const reply = await new Promise((resolve) =>
      runtime.sendMessage({ action: "x" }, resolve)
    );
    expect(reply).toBe("late");
    runtime.onMessage.removeListener(listener);
  });

  it("settles with undefined when nobody answers", async () => {
    const listener = vi.fn();
    runtime.onMessage.addListener(listener);
    await expect(
      runtime.sendMessage({ action: "lock" })
    ).resolves.toBeUndefined();
    expect(listener).toHaveBeenCalledOnce();
    runtime.onMessage.removeListener(listener);
    await expect(
      runtime.sendMessage({ action: "none" })
    ).resolves.toBeUndefined();
  });

  it("delivers asynchronously", async () => {
    const seen: string[] = [];
    const listener = () => {
      seen.push("listener");
    };
    runtime.onMessage.addListener(listener);
    const sent = runtime.sendMessage({});
    seen.push("after send");
    await sent;
    expect(seen).toEqual(["after send", "listener"]);
    runtime.onMessage.removeListener(listener);
  });

  it("returns the manifest", () => {
    expect(runtime.getManifest()).toEqual({ version: "1.0.2" });
  });
});
