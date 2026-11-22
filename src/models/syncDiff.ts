import { normalizeFolderPath } from "./folders";
import { SyncAccount } from "./syncCrypto";

export type SyncChoice = "add" | "overwrite" | "mirror";

export const COMPARED_FIELDS = [
  "issuer",
  "account",
  "folder",
  "archived",
  "pinned",
  "digits",
  "period",
  "algorithm",
  "counter",
] as const;

export type ComparedField = typeof COMPARED_FIELDS[number];

export interface ChangedAccount {
  local: SyncAccount;
  remote: SyncAccount;
  fields: ComparedField[];
}

export interface AccountDiff {
  onlyLocal: SyncAccount[];
  onlyRemote: SyncAccount[];
  changed: ChangedAccount[];
  same: number;
  // entries ignored because another entry on the same side has the same key
  duplicates: number;
}

export interface ApplyResult {
  result: SyncAccount[];
  added: SyncAccount[];
  updated: { before: SyncAccount; after: SyncAccount }[];
  removed: SyncAccount[];
}

export function normalizeSecret(secret: string): string {
  return secret.replace(/[\s=]/g, "").toUpperCase();
}

// Same account = same type + same secret. The internal hash is never used,
// because the same account added on two devices gets two different hashes.
export function accountKey(a: { type: string; secret: string }): string {
  return `${String(a.type).toLowerCase()}:${normalizeSecret(a.secret)}`;
}

export function fromExport(exportData: {
  [hash: string]: RawOTPStorage;
}): SyncAccount[] {
  const accounts: SyncAccount[] = [];
  for (const hash of Object.keys(exportData || {})) {
    const e = exportData[hash];
    if (!e || !e.secret) {
      continue;
    }
    accounts.push({
      type: e.type,
      secret: e.secret,
      issuer: e.issuer || "",
      account: e.account || "",
      folder: e.folder || "",
      archived: !!e.archived,
      pinned: !!e.pinned,
      digits: e.digits || 6,
      period: e.period || 30,
      algorithm: e.algorithm || "SHA1",
      counter: e.counter || 0,
    });
  }
  return accounts;
}

function fieldValue(a: SyncAccount, field: ComparedField) {
  if (field === "folder") {
    return normalizeFolderPath(a.folder || "");
  }
  return a[field];
}

function differingFields(a: SyncAccount, b: SyncAccount): ComparedField[] {
  return COMPARED_FIELDS.filter(
    (field) => fieldValue(a, field) !== fieldValue(b, field)
  );
}

// Index by key; first entry wins, later ones are counted as duplicates.
function indexByKey(accounts: SyncAccount[]) {
  const map = new Map<string, SyncAccount>();
  let duplicates = 0;
  for (const a of accounts) {
    const key = accountKey(a);
    if (map.has(key)) {
      duplicates++;
    } else {
      map.set(key, a);
    }
  }
  return { map, duplicates };
}

export function diffAccounts(
  local: SyncAccount[],
  remote: SyncAccount[]
): AccountDiff {
  const l = indexByKey(local);
  const r = indexByKey(remote);
  const diff: AccountDiff = {
    onlyLocal: [],
    onlyRemote: [],
    changed: [],
    same: 0,
    duplicates: l.duplicates + r.duplicates,
  };
  l.map.forEach((localAccount, key) => {
    const remoteAccount = r.map.get(key);
    if (!remoteAccount) {
      diff.onlyLocal.push(localAccount);
      return;
    }
    const fields = differingFields(localAccount, remoteAccount);
    if (fields.length === 0) {
      diff.same++;
    } else {
      diff.changed.push({ local: localAccount, remote: remoteAccount, fields });
    }
  });
  r.map.forEach((remoteAccount, key) => {
    if (!l.map.has(key)) {
      diff.onlyRemote.push(remoteAccount);
    }
  });
  return diff;
}

export function isInSync(diff: AccountDiff): boolean {
  return (
    diff.onlyLocal.length === 0 &&
    diff.onlyRemote.length === 0 &&
    diff.changed.length === 0
  );
}

// Computes the new state of `target` after taking `source` into it.
//  add:       source-only accounts are added; nothing else changes.
//  overwrite: add + matched accounts take the source's values; target-only kept.
//  mirror:    overwrite + target-only accounts are removed.
// Nothing is written here; the caller persists the result.
export function applyChoice(
  target: SyncAccount[],
  source: SyncAccount[],
  choice: SyncChoice
): ApplyResult {
  const src = indexByKey(source).map;
  const seenTarget = new Set<string>();
  const result: SyncAccount[] = [];
  const updated: ApplyResult["updated"] = [];
  const removed: SyncAccount[] = [];
  for (const t of target) {
    const key = accountKey(t);
    const s = src.get(key);
    if (seenTarget.has(key)) {
      // duplicate on the target side: left as it is
      result.push(t);
      continue;
    }
    seenTarget.add(key);
    if (!s) {
      if (choice === "mirror") {
        removed.push(t);
      } else {
        result.push(t);
      }
      continue;
    }
    if (choice !== "add" && differingFields(t, s).length > 0) {
      const after: SyncAccount = { ...s, secret: t.secret };
      updated.push({ before: t, after });
      result.push(after);
    } else {
      result.push(t);
    }
  }
  const added: SyncAccount[] = [];
  src.forEach((s, key) => {
    if (!seenTarget.has(key)) {
      added.push(s);
      result.push(s);
    }
  });
  return { result, added, updated, removed };
}
