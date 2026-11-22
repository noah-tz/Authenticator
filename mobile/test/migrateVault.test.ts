import { describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/core/kvstore";
import { Vault, VAULT_KEY } from "../src/core/vault";
import {
  MIGRATED_KEY,
  migrateVault,
  MigrationDeps,
  toRawEntry,
} from "../src/platform/migrateVault";
import { makeAccount } from "./helpers";

function deps(over: Partial<MigrationDeps> = {}) {
  let n = 0;
  const imported: { [hash: string]: RawOTPStorage }[] = [];
  const base: MigrationDeps = {
    legacy: new MemoryStore(),
    hasEntries: async () => false,
    importEntries: async (data) => {
      imported.push(data);
    },
    newHash: () => `hash-${++n}`,
    report: vi.fn(),
    ...over,
  };
  return { base, imported };
}

describe("migrateVault", () => {
  it("converts legacy accounts to raw extension entries and keeps the legacy key", async () => {
    const { base, imported } = deps();
    const vault = new Vault(base.legacy);
    await vault.add(
      makeAccount({ issuer: "A", folder: "Work", pinned: true, algorithm: "SHA256" })
    );
    await vault.add(
      makeAccount({ secret: "KRSXG5CTMVRXEZLU", type: "hotp", counter: 4 })
    );
    expect(await migrateVault(base)).toBe(2);
    expect(imported).toHaveLength(1);
    expect(imported[0]["hash-1"]).toMatchObject({
      hash: "hash-1",
      index: 0,
      encrypted: false,
      type: "1",
      algorithm: "2",
      issuer: "A",
      folder: "Work",
      pinned: true,
    });
    expect(imported[0]["hash-2"]).toMatchObject({ type: "2", counter: 4 });
    expect(await base.legacy.get(VAULT_KEY)).not.toBeNull();
    expect(await base.legacy.get(MIGRATED_KEY)).toBe("1");
  });

  it("does nothing when the extension storage already has entries", async () => {
    const { base, imported } = deps({ hasEntries: async () => true });
    await new Vault(base.legacy).add(makeAccount());
    expect(await migrateVault(base)).toBe(0);
    expect(imported).toHaveLength(0);
  });

  it("runs once", async () => {
    const { base, imported } = deps();
    await new Vault(base.legacy).add(makeAccount());
    await migrateVault(base);
    await migrateVault(base);
    expect(imported).toHaveLength(1);
  });

  it("reports a corrupt vault instead of throwing", async () => {
    const { base, imported } = deps();
    await base.legacy.set(VAULT_KEY, "{not json");
    await expect(migrateVault(base)).resolves.toBe(0);
    expect(base.report).toHaveBeenCalledOnce();
    expect(imported).toHaveLength(0);
    expect(await base.legacy.get(VAULT_KEY)).toBe("{not json");
  });

  it("reports an import failure instead of throwing", async () => {
    const { base } = deps({
      importEntries: async () => {
        throw new Error("boom");
      },
    });
    await new Vault(base.legacy).add(makeAccount());
    await expect(migrateVault(base)).resolves.toBe(0);
    expect(base.report).toHaveBeenCalledOnce();
    expect(await base.legacy.get(MIGRATED_KEY)).toBeNull();
  });

  it("falls back to totp and SHA1 for unknown values", () => {
    const raw = toRawEntry(makeAccount({ type: "weird", algorithm: "??" }), 3, "h");
    expect(raw).toMatchObject({ type: "1", algorithm: "1", index: 3, hash: "h" });
  });
});