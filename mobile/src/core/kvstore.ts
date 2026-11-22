import { SecureStorage } from "@aparajita/capacitor-secure-storage";
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

// Browser dev storage. NOT secure: values sit unencrypted in localStorage.
// Only used by `npm run dev` (web platform), never on the device.
export class InsecureLocalStorageStore implements KeyValueStore {
  private static PREFIX = "insecure-dev:";
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(InsecureLocalStorageStore.PREFIX + key);
  }
  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(InsecureLocalStorageStore.PREFIX + key, value);
  }
  async remove(key: string): Promise<void> {
    localStorage.removeItem(InsecureLocalStorageStore.PREFIX + key);
  }
}
// Android Keystore-backed storage on the device. In a browser (dev mode) the
// insecure localStorage adapter is used; with no localStorage (tests) memory.
export function createSecureStore(): KeyValueStore {
  if (!Capacitor.isNativePlatform()) {
    return typeof localStorage !== "undefined"
      ? new InsecureLocalStorageStore()
      : new MemoryStore();
  }
  return new SecureStoreImpl();
}

class SecureStoreImpl implements KeyValueStore {
  // Capacitor plugin objects are Proxies: reading `.then` is treated as a
  // native call. Never return, await or resolve the plugin itself; only
  // await its method calls. The init promise therefore resolves to void.
  private ready?: Promise<void>;
  private init(): Promise<void> {
    if (!this.ready) {
      this.ready = SecureStorage.setSynchronize(false).then(() => undefined);
    }
    return this.ready;
  }
  async get(key: string): Promise<string | null> {
    await this.init();
    const value = await SecureStorage.get(key, false, false);
    return typeof value === "string" ? value : null;
  }
  async set(key: string, value: string): Promise<void> {
    await this.init();
    await SecureStorage.set(key, value, false, false);
  }
  async remove(key: string): Promise<void> {
    await this.init();
    await SecureStorage.remove(key, false);
  }
}