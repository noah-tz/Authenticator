import "mocha";
import * as chai from "chai";
import { assert } from "chai";
import { SyncAccount } from "../../models/syncCrypto";
import {
  accountKey,
  applyChoice,
  diffAccounts,
  fromExport,
  isInSync,
} from "../../models/syncDiff";
chai.should();
mocha.setup("bdd");

const acc = (
  secret: string,
  extra: Partial<SyncAccount> = {}
): SyncAccount => ({
  type: "totp",
  secret,
  issuer: "Issuer",
  account: "me",
  folder: "",
  archived: false,
  pinned: false,
  digits: 6,
  period: 30,
  algorithm: "SHA1",
  counter: 0,
  ...extra,
});

const secrets = (list: SyncAccount[]) => list.map((a) => a.secret).sort();

describe("syncDiff matching", () => {
  it("matches the same secret even with different hashes", () => {
    const local = fromExport({
      "hash-a": { ...acc("AAAA"), hash: "hash-a", index: 0, encrypted: false },
    });
    const remote = fromExport({
      "hash-b": { ...acc("AAAA"), hash: "hash-b", index: 3, encrypted: false },
    });
    const diff = diffAccounts(local, remote);
    assert.equal(diff.same, 1);
    assert.isTrue(isInSync(diff));
  });

  it("does not match a different type", () => {
    const diff = diffAccounts(
      [acc("AAAA", { type: "totp" })],
      [acc("AAAA", { type: "hotp" })]
    );
    assert.equal(diff.onlyLocal.length, 1);
    assert.equal(diff.onlyRemote.length, 1);
  });

  it("normalizes spacing, case and padding of the secret", () => {
    assert.equal(accountKey(acc("jbsw y3dp==")), accountKey(acc("JBSWY3DP")));
  });

  it("reports folder, name and archive differences as changed", () => {
    const diff = diffAccounts(
      [acc("AAAA", { folder: "Work", account: "a", archived: false })],
      [acc("AAAA", { folder: "Home", account: "b", archived: true })]
    );
    assert.equal(diff.onlyLocal.length, 0);
    assert.equal(diff.onlyRemote.length, 0);
    assert.equal(diff.changed.length, 1);
    assert.sameMembers(diff.changed[0].fields as string[], [
      "folder",
      "account",
      "archived",
    ]);
  });

  it("treats equivalent folder paths as equal", () => {
    const diff = diffAccounts(
      [acc("AAAA", { folder: "Work/Mail" })],
      [acc("AAAA", { folder: " Work / Mail " })]
    );
    assert.isTrue(isInSync(diff));
  });

  it("reports identical sets as in sync and counts duplicates", () => {
    const diff = diffAccounts([acc("AAAA"), acc("AAAA")], [acc("AAAA")]);
    assert.isTrue(isInSync(diff));
    assert.equal(diff.duplicates, 1);
  });
});

describe("syncDiff applyChoice", () => {
  // target has A (old values) and T (target-only); source has A (new values) and S
  const target = () => [
    acc("AAAA", { folder: "Old", archived: false }),
    acc("TTTT"),
  ];
  const source = () => [
    acc("AAAA", { folder: "New", archived: true }),
    acc("SSSS"),
  ];

  it("add: only adds missing accounts", () => {
    const r = applyChoice(target(), source(), "add");
    assert.deepEqual(secrets(r.added), ["SSSS"]);
    assert.equal(r.updated.length, 0);
    assert.equal(r.removed.length, 0);
    assert.deepEqual(secrets(r.result), ["AAAA", "SSSS", "TTTT"]);
    const a = r.result.find((x) => x.secret === "AAAA") as SyncAccount;
    assert.equal(a.folder, "Old");
    assert.isFalse(a.archived);
  });

  it("overwrite: updates matched incl. folder and archived, adds, keeps target-only", () => {
    const r = applyChoice(target(), source(), "overwrite");
    assert.deepEqual(secrets(r.added), ["SSSS"]);
    assert.equal(r.updated.length, 1);
    assert.equal(r.removed.length, 0);
    assert.deepEqual(secrets(r.result), ["AAAA", "SSSS", "TTTT"]);
    const a = r.result.find((x) => x.secret === "AAAA") as SyncAccount;
    assert.equal(a.folder, "New");
    assert.isTrue(a.archived);
  });

  it("mirror: result equals the source and target-only are removed", () => {
    const r = applyChoice(target(), source(), "mirror");
    assert.deepEqual(secrets(r.removed), ["TTTT"]);
    assert.deepEqual(secrets(r.added), ["SSSS"]);
    assert.deepEqual(secrets(r.result), secrets(source()));
    assert.isTrue(isInSync(diffAccounts(r.result, source())));
  });

  it("works in both directions", () => {
    // swap roles: now the "device" is the source and "drive" the target
    const r = applyChoice(source(), target(), "mirror");
    assert.deepEqual(secrets(r.removed), ["SSSS"]);
    assert.deepEqual(secrets(r.added), ["TTTT"]);
    assert.isTrue(isInSync(diffAccounts(r.result, target())));
    const add = applyChoice(source(), target(), "add");
    assert.deepEqual(secrets(add.result), ["AAAA", "SSSS", "TTTT"]);
    assert.equal(add.updated.length, 0);
  });

  it("does not mutate its inputs", () => {
    const t = target();
    const s = source();
    applyChoice(t, s, "mirror");
    assert.deepEqual(t, target());
    assert.deepEqual(s, source());
  });
});
