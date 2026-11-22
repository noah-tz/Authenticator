import { createDriveApi } from "../../../src/models/driveApi";
import {
  decryptEnvelope,
  encryptPayload,
  KeyDeriver,
  parseEnvelope,
  SyncAccount,
  SyncPayload,
  SYNC_VERSION,
} from "../../../src/models/syncCrypto";

type DriveApi = ReturnType<typeof createDriveApi>;

export function createSyncRemote(api: DriveApi, derive: KeyDeriver) {
  // null when there is no file on Drive yet
  async function loadRemote(passphrase: string): Promise<SyncAccount[] | null> {
    const file = await api.findFile();
    if (!file) {
      return null;
    }
    const text = await api.downloadFile(file.id);
    const envelope = parseEnvelope(text);
    const payload = await decryptEnvelope(envelope, passphrase, derive);
    return payload.accounts;
  }

  async function remoteExists(): Promise<boolean> {
    return (await api.findFile()) !== null;
  }

  async function saveRemote(
    accounts: SyncAccount[],
    passphrase: string
  ): Promise<void> {
    const payload: SyncPayload = {
      version: SYNC_VERSION,
      updatedAt: new Date().toISOString(),
      accounts,
    };
    const envelope = await encryptPayload(payload, passphrase, derive);
    const text = JSON.stringify(envelope);
    const file = await api.findFile();
    if (file) {
      await api.updateFile(file.id, text);
    } else {
      await api.createFile(text);
    }
  }

  async function eraseRemote(): Promise<void> {
    const file = await api.findFile();
    if (file) {
      await api.deleteFile(file.id);
    }
  }

  return { loadRemote, remoteExists, saveRemote, eraseRemote };
}
