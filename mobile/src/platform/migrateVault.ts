import { OTPAlgorithm, OTPType } from "../../../src/models/otpEnums";
import { SyncAccount } from "../../../src/models/syncCrypto";
import { KeyValueStore } from "../core/kvstore";
import { Vault, VaultCorruptError } from "../core/vault";

// Remembers that the previous app's accounts were already carried over, so
// deleting every entry later does not bring them back.
export const MIGRATED_KEY = "legacy.vault.migrated";

export interface MigrationDeps {
  // the secure store of the previous app (vault.accounts lives here)
  legacy: KeyValueStore;
  // true when the extension storage already holds entries
  hasEntries(): Promise<boolean>;
  // the extension's EntryStorage.import for unencrypted raw entries
  importEntries(data: { [hash: string]: RawOTPStorage }): Promise<void>;
  newHash(): string;
  // user-visible message (notification/alert)
  report(message: string): void;
}

export function toRawEntry(
  account: SyncAccount,
  index: number,
  hash: string
): RawOTPStorage {
  // EntryStorage.import reads type and algorithm as numeric enum strings
  const type = OTPType[account.type as keyof typeof OTPType] || OTPType.totp;
  const algorithm =
    OTPAlgorithm[account.algorithm as keyof typeof OTPAlgorithm] ||
    OTPAlgorithm.SHA1;
  return {
    hash,
    index,
    encrypted: false,
    type: String(type),
    secret: account.secret,
    issuer: account.issuer,
    account: account.account,
    folder: account.folder,
    archived: account.archived,
    pinned: account.pinned,
    digits: account.digits,
    period: account.period,
    counter: account.counter,
    algorithm: String(algorithm),
  };
}

// Copies the previous app's accounts into the extension's storage on the
// first start after the update. Never deletes the legacy key. Errors are
// reported, not thrown, so the app still starts.
// Resolves with the number of accounts carried over.
export async function migrateVault(deps: MigrationDeps): Promise<number> {
  try {
    if ((await deps.legacy.get(MIGRATED_KEY)) !== null) {
      return 0;
    }
    if (await deps.hasEntries()) {
      return 0;
    }
    const accounts = await new Vault(deps.legacy).list();
    if (accounts.length > 0) {
      const data: { [hash: string]: RawOTPStorage } = {};
      accounts.forEach((account, index) => {
        const hash = deps.newHash();
        data[hash] = toRawEntry(account, index, hash);
      });
      await deps.importEntries(data);
    }
    await deps.legacy.set(MIGRATED_KEY, "1");
    return accounts.length;
  } catch (e) {
    console.error(e);
    deps.report(
      e instanceof VaultCorruptError
        ? "The accounts of the previous app version could not be read, so they were not carried over."
        : "Carrying over the accounts of the previous app version failed. They are still stored on this phone."
    );
    return 0;
  }
}
