import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const data = new Map<string, string>();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock("@aparajita/capacitor-secure-storage", () => {
  const impl: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    setSynchronize: async () => {
      calls.push("setSynchronize");
    },
    get: async (key) => data.get(key as string) ?? null,
    set: async (key, value) => {
      data.set(key as string, value as string);
    },
    remove: async (key) => {
      data.delete(key as string);
    },
  };
  // Like a Capacitor plugin: any property access, including `then`, is a native call.
  const SecureStorage = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          throw new Error('"SecureStorage.then()" is not implemented on android');
        }
        return impl[prop as string];
      },
    }
  );
  return { SecureStorage };
});

import { createSecureStore } from "../src/core/kvstore";

describe("secure store with a thenable-hostile plugin proxy", () => {
  it("initialises, writes, reads and removes without touching .then", async () => {
    const store = createSecureStore();
    expect(await store.get("a")).toBeNull();
    await store.set("a", "1");
    expect(await store.get("a")).toBe("1");
    await store.remove("a");
    expect(await store.get("a")).toBeNull();
    expect(calls).toEqual(["setSynchronize"]);
  });
});
