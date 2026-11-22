import { afterEach, describe, expect, it, vi } from "vitest";
import { createSecureStore, MemoryStore } from "../src/core/kvstore";
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
  it("returns an in-memory store off-device and never touches localStorage", async () => {
    const ls = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", ls);
    const store = createSecureStore();
    expect(store).toBeInstanceOf(MemoryStore);
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
    await store.remove("k");
    expect(await store.get("k")).toBeNull();
    expect(ls.getItem).not.toHaveBeenCalled();
    expect(ls.setItem).not.toHaveBeenCalled();
    expect(ls.removeItem).not.toHaveBeenCalled();
  });
});
