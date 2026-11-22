import { Store } from "vuex";
import {
  createFile,
  deleteFile,
  downloadFile,
  findFile,
  updateFile,
} from "./driveClient";
import { OTPAlgorithm, OTPEntry, OTPType } from "./otp";
import { argonDeriveKey } from "./password";
import { BrowserStorage, EntryStorage } from "./storage";
import {
  decryptEnvelope,
  encryptPayload,
  parseEnvelope,
  SyncAccount,
  SyncPayload,
  SYNC_VERSION,
} from "./syncCrypto";
import { accountKey, ApplyResult, fromExport } from "./syncDiff";

// Returns null when there is no file on Drive yet.
export async function loadRemote(
  passphrase: string
): Promise<SyncAccount[] | null> {
  const file = await findFile();
  if (!file) {
    return null;
  }
  const text = await downloadFile(file.id);
  const envelope = parseEnvelope(text);
  const payload = await decryptEnvelope(envelope, passphrase, argonDeriveKey);
  return payload.accounts;
}

export async function remoteExists(): Promise<boolean> {
  return (await findFile()) !== null;
}

export async function saveRemote(
  accounts: SyncAccount[],
  passphrase: string
): Promise<void> {
  const payload: SyncPayload = {
    version: SYNC_VERSION,
    updatedAt: new Date().toISOString(),
    accounts,
  };
  const envelope = await encryptPayload(payload, passphrase, argonDeriveKey);
  const text = JSON.stringify(envelope);
  const file = await findFile();
  if (file) {
    await updateFile(file.id, text);
  } else {
    await createFile(text);
  }
}

export async function eraseRemote(): Promise<void> {
  const file = await findFile();
  if (file) {
    await deleteFile(file.id);
  }
}

export function getLocalAccounts(store: Store<unknown>): SyncAccount[] {
  const state = store.state as {
    accounts: { exportData: { [hash: string]: RawOTPStorage } };
  };
  return fromExport(state.accounts.exportData);
}

function entryKey(entry: OTPEntry): string | null {
  if (!entry.secret) {
    return null;
  }
  return accountKey({ type: OTPType[entry.type], secret: entry.secret });
}

// Writes the outcome of applyChoice(local, remote, choice) into local storage
// through the same paths the add/delete/edit screens use.
export async function applyToLocal(
  store: Store<unknown>,
  outcome: ApplyResult
): Promise<void> {
  const state = store.state as {
    accounts: {
      entries: OTPEntry[];
      defaultEncryption: string;
      encryption: { [id: string]: EncryptionInterface };
    };
  };
  const entries = state.accounts.entries;
  const findEntry = (account: SyncAccount) => {
    const key = accountKey(account);
    return entries.find((entry) => entryKey(entry) === key);
  };

  for (const { after } of outcome.updated) {
    const entry = findEntry(after);
    if (!entry) {
      continue;
    }
    entry.issuer = after.issuer;
    entry.account = after.account;
    entry.folder = after.folder;
    entry.archived = after.archived;
    entry.pinned = after.pinned;
    entry.digits = after.digits;
    entry.period = after.period;
    entry.counter = after.counter;
    entry.algorithm =
      OTPAlgorithm[after.algorithm as keyof typeof OTPAlgorithm] ||
      OTPAlgorithm.SHA1;
  }
  if (outcome.updated.length > 0) {
    await EntryStorage.set(entries);
  }

  for (const account of outcome.removed) {
    const entry = findEntry(account);
    if (!entry) {
      continue;
    }
    await entry.delete();
    await store.dispatch("accounts/deleteCode", entry.hash);
  }

  const encryption =
    state.accounts.encryption[state.accounts.defaultEncryption];
  for (const account of outcome.added) {
    const entry = new OTPEntry(
      {
        type: OTPType[account.type as keyof typeof OTPType] || OTPType.totp,
        index: 0,
        issuer: account.issuer,
        account: account.account,
        encrypted: false,
        secret: account.secret,
        counter: account.counter,
        period: account.period,
        digits: account.digits,
        algorithm:
          OTPAlgorithm[account.algorithm as keyof typeof OTPAlgorithm] ||
          OTPAlgorithm.SHA1,
        pinned: account.pinned,
        folder: account.folder,
        archived: account.archived,
      },
      encryption
    );
    await entry.create();
    await store.dispatch("accounts/addCode", entry);
  }

  // refresh export data (addCode/deleteCode already do this; edits do not)
  store.commit(
    "accounts/updateExport",
    await EntryStorage.getExport(state.accounts.entries)
  );
  store.commit("accounts/updateEncExport", {
    entries: await EntryStorage.getExport(state.accounts.entries, true),
    keys: await BrowserStorage.getKeys(),
  });
}
