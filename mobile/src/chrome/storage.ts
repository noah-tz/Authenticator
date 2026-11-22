import type { KeyValueStore } from "../core/kvstore";
import { dual, Callback } from "./dual";

type Items = { [key: string]: unknown };
type Changes = { [key: string]: { oldValue?: unknown; newValue?: unknown } };
type ChangeListener = (changes: Changes, areaName: string) => void;

// Result of a get/set is always plain JSON: never a plugin proxy (commit
// 6b1c8d60) and never a shared reference into the cache.
function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

// Where an area keeps its single JSON blob.
export interface AreaBacking {
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
}

export function kvBacking(store: KeyValueStore, key: string): AreaBacking {
  return {
    load: () => store.get(key),
    save: (json) => store.set(key, json),
  };
}

// Mirrors to sessionStorage: survives location.reload() inside one WebView
// run, never reaches disk, is gone when the process dies.
export function sessionBacking(key: string): AreaBacking {
  return {
    load: async () => sessionStorage.getItem(key),
    save: async (json) => sessionStorage.setItem(key, json),
  };
}

export class StorageArea {
  private cache: Items = {};
  private queue: Promise<void> = Promise.resolve();
  private listeners: ChangeListener[] = [];

  constructor(
    readonly name: string,
    private backing: AreaBacking,
    private onChange?: ChangeListener
  ) {}

  async load(): Promise<void> {
    const raw = await this.backing.load();
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        this.cache = parsed;
      }
    }
  }

  readonly onChanged = {
    addListener: (listener: ChangeListener) => {
      this.listeners.push(listener);
    },
    removeListener: (listener: ChangeListener) => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    },
    hasListener: (listener: ChangeListener) =>
      this.listeners.includes(listener),
  };

  private persist(): Promise<void> {
    const json = JSON.stringify(this.cache);
    // serialised: a later write never lands before an earlier one
    const write = this.queue.then(() => this.backing.save(json));
    this.queue = write.catch(() => undefined);
    return write;
  }

  private notify(changes: Changes): void {
    if (Object.keys(changes).length === 0) return;
    for (const listener of [...this.listeners]) {
      listener(clone(changes), this.name);
    }
    this.onChange?.(clone(changes), this.name);
  }

  private read(keys?: string | string[] | Items | null): Items {
    if (keys === null || keys === undefined) {
      return clone(this.cache);
    }
    const result: Items = {};
    if (typeof keys === "string") {
      keys = [keys];
    }
    if (Array.isArray(keys)) {
      for (const key of keys) {
        if (key in this.cache) result[key] = clone(this.cache[key]);
      }
      return result;
    }
    for (const key of Object.keys(keys)) {
      result[key] =
        key in this.cache ? clone(this.cache[key]) : clone(keys[key]);
    }
    return result;
  }

  get(
    keys?: string | string[] | Items | null | Callback<Items>,
    callback?: Callback<Items>
  ): Promise<Items> | undefined {
    if (typeof keys === "function") {
      callback = keys;
      keys = null;
    }
    return dual(callback, async () => this.read(keys));
  }

  set(items: Items, callback?: Callback<void>): Promise<void> | undefined {
    return dual(callback, async () => {
      const changes: Changes = {};
      for (const key of Object.keys(items)) {
        const value = clone(items[key]);
        if (value === undefined) continue;
        const oldValue = this.cache[key];
        if (JSON.stringify(oldValue) === JSON.stringify(value)) continue;
        changes[key] = { newValue: clone(value) };
        if (key in this.cache) changes[key].oldValue = clone(oldValue);
        this.cache[key] = value;
      }
      const saved = this.persist();
      this.notify(changes);
      await saved;
    });
  }

  remove(
    keys: string | string[],
    callback?: Callback<void>
  ): Promise<void> | undefined {
    return dual(callback, async () => {
      const changes: Changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (!(key in this.cache)) continue;
        changes[key] = { oldValue: clone(this.cache[key]) };
        delete this.cache[key];
      }
      const saved = this.persist();
      this.notify(changes);
      await saved;
    });
  }

  clear(callback?: Callback<void>): Promise<void> | undefined {
    return this.remove(Object.keys(this.cache), callback);
  }
}
