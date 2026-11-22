import { describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/core/kvstore";
import { kvBacking, StorageArea } from "../src/chrome/storage";

async function freshArea(store = new MemoryStore()) {
  const area = new StorageArea(
    "local",
    kvBacking(store, "chrome.storage.local")
  );
  await area.load();
  return { area, store };
}

describe("chrome.storage shim", () => {
  it("sets and gets by key, key list, null and defaults", async () => {
    const { area } = await freshArea();
    await area.set({ a: 1, b: { c: [1, 2] } });
    expect(await area.get("a")).toEqual({ a: 1 });
    expect(await area.get(["a", "missing"])).toEqual({ a: 1 });
    expect(await area.get(null)).toEqual({ a: 1, b: { c: [1, 2] } });
    expect(await area.get()).toEqual({ a: 1, b: { c: [1, 2] } });
    expect(await area.get({ a: 0, z: "default" })).toEqual({
      a: 1,
      z: "default",
    });
  });

  it("supports the callback form", async () => {
    const { area } = await freshArea();
    await new Promise<void>((resolve) => area.set({ k: "v" }, () => resolve()));
    const got = await new Promise((resolve) => area.get("k", resolve));
    expect(got).toEqual({ k: "v" });
    const all = await new Promise((resolve) => area.get(resolve));
    expect(all).toEqual({ k: "v" });
  });

  it("removes and clears", async () => {
    const { area } = await freshArea();
    await area.set({ a: 1, b: 2, c: 3 });
    await area.remove("a");
    expect(await area.get(null)).toEqual({ b: 2, c: 3 });
    await area.remove(["b"]);
    expect(await area.get(null)).toEqual({ c: 3 });
    await area.clear();
    expect(await area.get(null)).toEqual({});
  });

  it("persists one JSON blob and reloads it", async () => {
    const store = new MemoryStore();
    const { area } = await freshArea(store);
    await area.set({ x: "y" });
    expect(
      JSON.parse((await store.get("chrome.storage.local")) as string)
    ).toEqual({ x: "y" });
    const { area: again } = await freshArea(store);
    expect(await again.get("x")).toEqual({ x: "y" });
  });

  it("returns copies, never the cached objects", async () => {
    const { area } = await freshArea();
    const value = { nested: { n: 1 } };
    await area.set({ value });
    value.nested.n = 2;
    const first = (await area.get("value")) as {
      value: { nested: { n: number } };
    };
    expect(first.value.nested.n).toBe(1);
    first.value.nested.n = 3;
    const second = (await area.get("value")) as {
      value: { nested: { n: number } };
    };
    expect(second.value.nested.n).toBe(1);
    expect(Object.getPrototypeOf(second)).toBe(Object.prototype);
  });

  it("reports changes to onChanged listeners", async () => {
    const { area } = await freshArea();
    const listener = vi.fn();
    area.onChanged.addListener(listener);
    await area.set({ a: 1 });
    await area.set({ a: 2 });
    await area.set({ a: 2 });
    await area.remove("a");
    expect(listener.mock.calls).toEqual([
      [{ a: { newValue: 1 } }, "local"],
      [{ a: { oldValue: 1, newValue: 2 } }, "local"],
      [{ a: { oldValue: 2 } }, "local"],
    ]);
  });

  it("serialises writes in call order", async () => {
    const order: string[] = [];
    const store = new MemoryStore();
    const slow = {
      get: (k: string) => store.get(k),
      remove: (k: string) => store.remove(k),
      set: async (k: string, v: string) => {
        await new Promise((r) => setTimeout(r, v.includes('"n":1') ? 20 : 0));
        order.push(v);
        await store.set(k, v);
      },
    };
    const { area } = await freshArea((slow as unknown) as MemoryStore);
    await Promise.all([area.set({ n: 1 }), area.set({ n: 2 })]);
    expect(order).toEqual(['{"n":1}', '{"n":2}']);
    expect(await store.get("chrome.storage.local")).toBe('{"n":2}');
  });
});
