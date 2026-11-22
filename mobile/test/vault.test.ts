import { afterEach, describe, expect, it, vi } from "vitest";
import { createSecureStore, InsecureLocalStorageStore, MemoryStore } from "../src/core/kvstore";
import { Vault, VAULT_KEY, VaultCorruptError } from "../src/core/vault";
import { makeAccount } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Vault", () => {
  it("adds accounts and dedupes by type + normalized secret", async () => {
    const vault = new Vault(new MemoryStore());
    expect(await vault.add(makeAccount({ secret: "ABCD EFGH" }))).toBe(true);
    expect(
      await vault.add(makeAccount({ secret: "abcdefgh", issuer: "Other" }))
    ).toBe(false);
    expect(
      await vault.add(makeAccount({ secret: "ABCDEFGH", type: "hotp" }))
    ).toBe(true);
    expect(await vault.list()).toHaveLength(2);
  });

  it("updates and removes by key", async () => {
    const vault = new Vault(new MemoryStore());
    await vault.add(makeAccount({ issuer: "A" }));
    expect(await vault.update(makeAccount({ issuer: "B", folder: "X" }))).toBe(
      true
    );
    expect((await vault.list())[0]).toMatchObject({ issuer: "B", folder: "X" });
    expect(await vault.update(makeAccount({ secret: "NOPE" }))).toBe(false);
    expect(await vault.remove(makeAccount())).toBe(true);
    expect(await vault.remove(makeAccount())).toBe(false);
    expect(await vault.list()).toEqual([]);
  });

  it("archives and unarchives", async () => {
    const vault = new Vault(new MemoryStore());
    await vault.add(makeAccount());
    await vault.setArchived(makeAccount(), true);
    expect((await vault.list())[0].archived).toBe(true);
    await vault.setArchived(makeAccount(), false);
    expect((await vault.list())[0].archived).toBe(false);
    expect(await vault.setArchived(makeAccount({ secret: "NOPE" }), true)).toBe(
      false
    );
  });

  it("replaceAll swaps the whole list and folderPaths are unique and sorted", async () => {
    const vault = new Vault(new MemoryStore());
    await vault.add(makeAccount({ secret: "AAAA" }));
    await vault.replaceAll([
      makeAccount({ secret: "BBBB", folder: " Work / Dev " }),
      makeAccount({ secret: "CCCC", folder: "Work/Dev" }),
      makeAccount({ secret: "DDDD", folder: "Home" }),
      makeAccount({ secret: "EEEE", folder: "" }),
    ]);
    expect(await vault.list()).toHaveLength(4);
    expect(await vault.folderPaths()).toEqual(["Home", "Work/Dev"]);
  });

  it("starts empty", async () => {
    expect(await new Vault(new MemoryStore()).list()).toEqual([]);
  });

  it("corrupt data is reported and left untouched", async () => {
    const store = new MemoryStore();
    await store.set(VAULT_KEY, "{not json");
    const vault = new Vault(store);
    await expect(vault.list()).rejects.toBeInstanceOf(VaultCorruptError);
    await expect(vault.add(makeAccount())).rejects.toBeInstanceOf(
      VaultCorruptError
    );
    expect(await store.get(VAULT_KEY)).toBe("{not json");
    await store.set(VAULT_KEY, '{"a":1}');
    await expect(vault.list()).rejects.toBeInstanceOf(VaultCorruptError);
  });
});

describe("createSecureStore", () => {
  it("uses the labelled insecure localStorage adapter in a browser", async () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
    const store = createSecureStore();
    expect(store).toBeInstanceOf(InsecureLocalStorageStore);
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
    expect([...data.keys()]).toEqual(["insecure-dev:k"]);
    await store.remove("k");
    expect(await store.get("k")).toBeNull();
  });
  it("falls back to memory when there is no localStorage", async () => {
    const store = createSecureStore();
    expect(store).toBeInstanceOf(MemoryStore);
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
  });
});
