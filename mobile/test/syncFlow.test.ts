import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/core/kvstore";
import { Vault } from "../src/core/vault";
import { createSyncRemote } from "../src/core/syncRemote";
import { applyChoice, diffAccounts } from "../../src/models/syncDiff";
import { SyncAccount } from "../../src/models/syncCrypto";
import { fakeDerive, makeAccount } from "./helpers";

const local = (): SyncAccount[] => [
  makeAccount({ secret: "AAAA", issuer: "local-only" }),
  makeAccount({ secret: "BBBB", issuer: "both", folder: "Old", pinned: false }),
];
const remote = (): SyncAccount[] => [
  makeAccount({ secret: "BBBB", issuer: "both", folder: "New", pinned: true }),
  makeAccount({ secret: "CCCC", issuer: "remote-only" }),
];

async function vaultWith(accounts: SyncAccount[]) {
  const vault = new Vault(new MemoryStore());
  await vault.replaceAll(accounts);
  return vault;
}

describe("pulling remote into the vault", () => {
  it("add: only new accounts are added", async () => {
    const vault = await vaultWith(local());
    const outcome = applyChoice(await vault.list(), remote(), "add");
    await vault.replaceAll(outcome.result);
    const list = await vault.list();
    expect(list.map((a) => a.issuer)).toEqual([
      "local-only",
      "both",
      "remote-only",
    ]);
    expect(list.find((a) => a.secret === "BBBB")!.folder).toBe("Old");
  });

  it("overwrite: matched accounts take remote values, local-only stay", async () => {
    const vault = await vaultWith(local());
    const outcome = applyChoice(await vault.list(), remote(), "overwrite");
    await vault.replaceAll(outcome.result);
    const list = await vault.list();
    expect(list).toHaveLength(3);
    expect(list.find((a) => a.secret === "BBBB")).toMatchObject({
      folder: "New",
      pinned: true,
    });
    expect(list.some((a) => a.secret === "AAAA")).toBe(true);
  });

  it("mirror: local-only accounts are removed", async () => {
    const vault = await vaultWith(local());
    const outcome = applyChoice(await vault.list(), remote(), "mirror");
    await vault.replaceAll(outcome.result);
    const list = await vault.list();
    expect(list.map((a) => a.secret).sort()).toEqual(["BBBB", "CCCC"]);
    expect(outcome.removed.map((a) => a.secret)).toEqual(["AAAA"]);
  });
});

describe("pushing the vault to remote", () => {
  it("add / overwrite / mirror compute the new remote content", () => {
    const l = local();
    const r = remote();
    expect(applyChoice(r, l, "add").result.map((a) => a.secret)).toEqual([
      "BBBB",
      "CCCC",
      "AAAA",
    ]);
    const over = applyChoice(r, l, "overwrite").result;
    expect(over.find((a) => a.secret === "BBBB")!.folder).toBe("Old");
    expect(over).toHaveLength(3);
    const mirror = applyChoice(r, l, "mirror").result;
    expect(mirror.map((a) => a.secret).sort()).toEqual(["AAAA", "BBBB"]);
  });

  it("diff is empty once a mirror has been applied", () => {
    const l = local();
    const mirrored = applyChoice(remote(), l, "mirror").result;
    const diff = diffAccounts(l, mirrored);
    expect(diff.onlyLocal).toHaveLength(0);
    expect(diff.onlyRemote).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });
});

describe("createSyncRemote", () => {
  function fakeApi() {
    let content: string | null = null;
    return {
      get content() {
        return content;
      },
      findFile: async (): Promise<{ id: string } | null> =>
        content === null ? null : { id: "f" },
      downloadFile: async () => content as string,
      createFile: async (text: string) => {
        content = text;
      },
      updateFile: async (_id: string, text: string) => {
        content = text;
      },
      deleteFile: async () => {
        content = null;
      },
    };
  }

  it("round-trips through the injected api and deriver", async () => {
    const api = fakeApi();
    const remoteSync = createSyncRemote(api, fakeDerive);
    expect(await remoteSync.remoteExists()).toBe(false);
    expect(await remoteSync.loadRemote("pw")).toBeNull();
    await remoteSync.saveRemote(local(), "pw");
    expect(await remoteSync.remoteExists()).toBe(true);
    expect(api.content).not.toContain("local-only");
    expect(await remoteSync.loadRemote("pw")).toEqual(local());
    await remoteSync.saveRemote(remote(), "pw");
    expect(await remoteSync.loadRemote("pw")).toEqual(remote());
    await expect(remoteSync.loadRemote("bad")).rejects.toMatchObject({
      code: "WRONG_PASSPHRASE",
    });
    await remoteSync.eraseRemote();
    expect(await remoteSync.remoteExists()).toBe(false);
  });
});
