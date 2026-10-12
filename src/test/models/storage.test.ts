import "mocha";
import * as chai from "chai";
import { assert } from "chai";
import * as sinonChai from "sinon-chai";

import { EntryStorage } from "../../models/storage";
import { OTPEntry, OTPType, OTPAlgorithm } from "../../models/otp";

import chrome from "sinon-chrome";

chai.should();
chai.use(sinonChai);
mocha.setup("bdd");

describe("EntryStorage folder round-trip", () => {
  // in-memory backing store shared by chrome.storage.sync get/set
  let store: Record<string, unknown>;

  const buildEntry = (folder: string) =>
    new OTPEntry({
      encrypted: false,
      index: 0,
      issuer: "Example",
      account: "user@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      type: OTPType.totp,
      algorithm: OTPAlgorithm.SHA1,
      folder,
    });

  beforeEach(() => {
    // Pin storage location to "sync" so getStorageLocation() is deterministic.
    store = {
      UserSettings: { storageLocation: "sync" },
    };

    // Back chrome.storage.sync get/set with the in-memory object.
    global.chrome.storage.sync.get = ((
      ...args: unknown[]
    ): Promise<Record<string, unknown>> => {
      const callback = args.find((arg) => typeof arg === "function") as
        | ((items: Record<string, unknown>) => void)
        | undefined;
      const key = args.find(
        (arg) => typeof arg === "string" || Array.isArray(arg)
      ) as string | string[] | undefined;

      let result: Record<string, unknown>;
      if (typeof key === "string") {
        result = { [key]: store[key] };
      } else if (Array.isArray(key)) {
        result = {};
        for (const k of key) {
          result[k] = store[k];
        }
      } else {
        result = { ...store };
      }

      if (callback) {
        callback(result);
      }
      return Promise.resolve(result);
    }) as typeof global.chrome.storage.sync.get;

    global.chrome.storage.sync.set = ((
      items: Record<string, unknown>,
      callback?: () => void
    ): Promise<void> => {
      Object.assign(store, items);
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }) as typeof global.chrome.storage.sync.set;

    global.chrome.storage.local.get = ((
      ...args: unknown[]
    ): Promise<Record<string, unknown>> => {
      const callback = args.find((arg) => typeof arg === "function") as
        | ((items: Record<string, unknown>) => void)
        | undefined;
      const result = { UserSettings: { storageLocation: "sync" } };
      if (callback) {
        callback(result);
      }
      return Promise.resolve(result);
    }) as typeof global.chrome.storage.local.get;

    global.chrome.storage.managed.get = chrome.storage.managed.get;
    chrome.storage.managed.get.yields({});
  });

  afterEach(() => {
    chrome.flush();
  });

  it("preserves a non-empty folder through set -> get", async () => {
    const entry = buildEntry("Work");
    await EntryStorage.set([entry]);

    const entries = await EntryStorage.get();
    const stored = entries.find((e) => e.hash === entry.hash);

    assert.ok(stored, "stored entry should be returned");
    assert.equal(stored?.folder, "Work");
  });

  it("reads an empty folder back as falsy and does not throw", async () => {
    const entry = buildEntry("");
    await EntryStorage.set([entry]);

    const entries = await EntryStorage.get();
    const stored = entries.find((e) => e.hash === entry.hash);

    assert.ok(stored, "stored entry should be returned");
    assert.notOk(stored?.folder);
  });
});
