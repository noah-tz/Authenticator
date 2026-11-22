import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it, vi } from "vitest"; 
import { argonDeriveKey } from "../src/core/argon";
import {
  decryptEnvelope,
  encryptPayload,
  parseEnvelope,
  SyncPayload,
  SYNC_VERSION,
} from "../../src/models/syncCrypto";
import { makeAccount } from "./helpers";

const dir = resolve(__dirname, "fixtures");
const fixtureText = readFileSync(resolve(dir, "extension-sync-file.json"), "utf8");
const expected = JSON.parse(
  readFileSync(resolve(dir, "extension-sync-file.expected.json"), "utf8")
) as { passphrase: string; payload: SyncPayload };

// Argon2id with 19 MiB: a few hundred ms each.
const SLOW = 60000;

describe("file written by the extension's own code", () => {
  it(
    "decrypts with the mobile Argon2id deriver",
    async () => {
      const envelope = parseEnvelope(fixtureText);
      expect(envelope.kdf.memoryKiB).toBe(19456);
      const payload = await decryptEnvelope(
        envelope,
        expected.passphrase,
        argonDeriveKey
      );
      expect(payload).toEqual(expected.payload);
      expect(payload.accounts).toHaveLength(3);
    },
    SLOW
  );

  it(
    "accepts the passphrase typed in decomposed form (NFKC)",
    async () => {
      const decomposed = expected.passphrase.normalize("NFD");
      expect(decomposed).not.toBe(expected.passphrase);
      const payload = await decryptEnvelope(
        parseEnvelope(fixtureText),
        decomposed,
        argonDeriveKey
      );
      expect(payload.accounts).toHaveLength(3);
    },
    SLOW
  );

  it(
    "wrong passphrase gives WRONG_PASSPHRASE",
    async () => {
      await expect(
        decryptEnvelope(parseEnvelope(fixtureText), "wrong", argonDeriveKey)
      ).rejects.toMatchObject({ code: "WRONG_PASSPHRASE" });
    },
    SLOW
  );

  it("rejects memoryKiB above 262144 before deriving", async () => {
    const envelope = JSON.parse(fixtureText);
    envelope.kdf.memoryKiB = 262145;
    const derive = vi.fn(argonDeriveKey);
    await expect(
      decryptEnvelope(parseEnvelope(JSON.stringify(envelope)), expected.passphrase, derive)
    ).rejects.toMatchObject({ code: "BAD_KDF_PARAMS" });
    expect(derive).not.toHaveBeenCalled();
  });
});

describe("file written by the mobile code", () => {
  it(
    "decrypts back to the same payload",
    async () => {
      const payload: SyncPayload = {
        version: SYNC_VERSION,
        updatedAt: new Date().toISOString(),
        accounts: [makeAccount({ folder: "A/B" })],
      };
      const envelope = await encryptPayload(payload, "pässword", argonDeriveKey);
      const text = JSON.stringify(envelope);
      const back = await decryptEnvelope(
        parseEnvelope(text),
        "pässword",
        argonDeriveKey
      );
      expect(back).toEqual(payload);
    },
    SLOW
  );
});