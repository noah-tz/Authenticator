import { SyncAccount } from "../../../src/models/syncCrypto";
import { accountKey } from "../../../src/models/syncDiff";
import { parseFolderPath } from "../../../src/models/folders";
import { KeyValueStore } from "./kvstore";

export const VAULT_KEY = "vault.accounts";

export class VaultCorruptError extends Error {
  constructor() {
    super("VAULT_CORRUPT");
    Object.setPrototypeOf(this, VaultCorruptError.prototype);
  }
}

// All accounts as one JSON array in a key-value store. A stored value that
// cannot be parsed is reported, never overwritten or treated as empty.
export class Vault {
  constructor(private store: KeyValueStore) {}

  async list(): Promise<SyncAccount[]> {
    const raw = await this.store.get(VAULT_KEY);
    if (raw === null) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new VaultCorruptError();
    }
    if (!Array.isArray(parsed)) {
      throw new VaultCorruptError();
    }
    return parsed as SyncAccount[];
  }

  private async save(accounts: SyncAccount[]): Promise<void> {
    await this.store.set(VAULT_KEY, JSON.stringify(accounts));
  }

  // false when an account with the same type and secret already exists
  async add(account: SyncAccount): Promise<boolean> {
    const accounts = await this.list();
    const key = accountKey(account);
    if (accounts.some((a) => accountKey(a) === key)) {
      return false;
    }
    accounts.push(account);
    await this.save(accounts);
    return true;
  }

  // Replaces the account that has the same key as `account`; false if none.
  async update(account: SyncAccount): Promise<boolean> {
    const accounts = await this.list();
    const key = accountKey(account);
    const index = accounts.findIndex((a) => accountKey(a) === key);
    if (index < 0) {
      return false;
    }
    accounts[index] = account;
    await this.save(accounts);
    return true;
  }

  async remove(account: { type: string; secret: string }): Promise<boolean> {
    const accounts = await this.list();
    const key = accountKey(account);
    const rest = accounts.filter((a) => accountKey(a) !== key);
    if (rest.length === accounts.length) {
      return false;
    }
    await this.save(rest);
    return true;
  }

  async setArchived(
    account: { type: string; secret: string },
    archived: boolean
  ): Promise<boolean> {
    const accounts = await this.list();
    const key = accountKey(account);
    const found = accounts.find((a) => accountKey(a) === key);
    if (!found) {
      return false;
    }
    found.archived = archived;
    await this.save(accounts);
    return true;
  }

  async replaceAll(accounts: SyncAccount[]): Promise<void> {
    await this.save(accounts);
  }

  async folderPaths(): Promise<string[]> {
    const paths = new Set<string>();
    for (const a of await this.list()) {
      const segments = parseFolderPath(a.folder);
      if (segments.length > 0) {
        paths.add(segments.join("/"));
      }
    }
    return Array.from(paths).sort((a, b) => a.localeCompare(b));
  }
}