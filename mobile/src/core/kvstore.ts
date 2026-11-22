import { Capacitor } from "@capacitor/core";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

// Android Keystore-backed storage on the device. Off-device (browser, tests)
// secrets are kept in memory only, never in localStorage.
export function createSecureStore(): KeyValueStore {
  if (!Capacitor.isNativePlatform()) {
    return new MemoryStore();
  }
  return new SecureStoreImpl();
}

class SecureStoreImpl implements KeyValueStore {
  private plugin?: Promise<
    typeof import("@aparajita/capacitor-secure-storage")["SecureStorage"]
  >;
  private load() {
    if (!this.plugin) {
      this.plugin = import("@aparajita/capacitor-secure-storage").then(
        async (m) => {
          await m.SecureStorage.setSynchronize(false);
          return m.SecureStorage;
        }
      );
    }
    return this.plugin;
  }
  async get(key: string): Promise<string | null> {
    const storage = await this.load();
    const value = await storage.get(key, false, false);
    return typeof value === "string" ? value : null;
  }
  async set(key: string, value: string): Promise<void> {
    const storage = await this.load();
    await storage.set(key, value, false, false);
  }
  async remove(key: string): Promise<void> {
    const storage = await this.load();
    await storage.remove(key, false);
  }
}