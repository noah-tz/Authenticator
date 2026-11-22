import "mocha";
import * as chai from "chai";
import { assert } from "chai";
import {
  decryptEnvelope,
  encryptPayload,
  KeyDeriver,
  SyncError,
  SyncPayload,
} from "../../models/syncCrypto";
chai.should();
mocha.setup("bdd");

// Fast stand-in for Argon2 (the sandbox iframe does not exist in tests).
const fakeDerive: KeyDeriver = async (passphrase, salt) => {
  const data = new Uint8Array([
    ...new TextEncoder().encode(passphrase),
    ...salt,
  ]);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
};

const SECRET = "JBSWY3DPEHPK3PXP";
const payload: SyncPayload = {
  version: 1,
  updatedAt: "2024-01-01T00:00:00.000Z",
  accounts: [
    {
      type: "totp",
      secret: SECRET,
      issuer: "Example",
      account: "user@example.com",
      folder: "Work/Email",
      archived: true,
      pinned: false,
      digits: 6,
      period: 30,
      algorithm: "SHA1",
      counter: 0,
    },
  ],
};

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (e) {
    assert.instanceOf(e, SyncError);
    assert.equal((e as SyncError).code, code);
    return;
  }
  assert.fail("expected SyncError " + code);
}

describe("syncCrypto", () => {
  it("round-trips with the right passphrase, keeping folder and archived", async () => {
    const env = await encryptPayload(payload, "correct horse", fakeDerive);
    const out = await decryptEnvelope(env, "correct horse", fakeDerive);
    assert.deepEqual(out, payload);
    assert.equal(out.accounts[0].folder, "Work/Email");
    assert.isTrue(out.accounts[0].archived);
  });

  it("rejects a wrong passphrase", async () => {
    const env = await encryptPayload(payload, "correct horse", fakeDerive);
    await expectCode(
      decryptEnvelope(env, "wrong", fakeDerive),
      "WRONG_PASSPHRASE"
    );
  });

  it("rejects a tampered ciphertext", async () => {
    const env = await encryptPayload(payload, "pw", fakeDerive);
    const bytes = atob(env.ciphertext).split("");
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1);
    env.ciphertext = btoa(bytes.join(""));
    await expectCode(
      decryptEnvelope(env, "pw", fakeDerive),
      "WRONG_PASSPHRASE"
    );
  });

  it("uses a fresh salt and IV each time", async () => {
    const a = await encryptPayload(payload, "pw", fakeDerive);
    const b = await encryptPayload(payload, "pw", fakeDerive);
    assert.notEqual(a.kdf.salt, b.kdf.salt);
    assert.notEqual(a.cipher.iv, b.cipher.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
  });

  it("does not contain plaintext secrets", async () => {
    const env = await encryptPayload(payload, "pw", fakeDerive);
    assert.notInclude(JSON.stringify(env), SECRET);
    assert.notInclude(JSON.stringify(env), "user@example.com");
  });

  it("rejects unknown format or version", async () => {
    const env = await encryptPayload(payload, "pw", fakeDerive);
    await expectCode(
      decryptEnvelope({ ...env, version: 2 }, "pw", fakeDerive),
      "UNSUPPORTED_VERSION"
    );
    await expectCode(
      decryptEnvelope({ ...env, format: "other" }, "pw", fakeDerive),
      "UNSUPPORTED_VERSION"
    );
  });

  it("rejects KDF parameters above the bounds", async () => {
    const env = await encryptPayload(payload, "pw", fakeDerive);
    await expectCode(
      decryptEnvelope(
        { ...env, kdf: { ...env.kdf, memoryKiB: 1024 * 1024 } },
        "pw",
        fakeDerive
      ),
      "BAD_KDF_PARAMS"
    );
    await expectCode(
      decryptEnvelope(
        { ...env, kdf: { ...env.kdf, timeCost: 11 } },
        "pw",
        fakeDerive
      ),
      "BAD_KDF_PARAMS"
    );
  });
});
