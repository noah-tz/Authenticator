// Regenerates test/fixtures/extension-sync-file.json using the extension's own
// encryptPayload and its argon2-browser dependency (repo root node_modules).
// Run from mobile/: npx vite-node scripts/make-fixture.ts
import { createRequire } from "module";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_KDF,
  encryptPayload,
  KeyDeriver,
  SyncPayload,
  SYNC_VERSION,
} from "../../src/models/syncCrypto";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, "../../package.json"));
// Node 22 has fetch, which makes argon2-browser try to fetch() its wasm file.
// Hide it for the whole run (no network is needed) so it reads the file from disk instead.
(globalThis as { fetch?: unknown }).fetch = undefined;
const argon2 = require("argon2-browser");

const derive: KeyDeriver = async (passphrase, salt, kdf) => {
  const result = await argon2.hash({
    pass: passphrase,
    salt,
    time: kdf.timeCost,
    mem: kdf.memoryKiB,
    parallelism: kdf.parallelism,
    hashLen: kdf.hashLength,
    type: argon2.ArgonType.Argon2id,
  });
  return new Uint8Array(result.hash);
};

// Fullwidth digits and a ligature: only NFKC-normalizing makes these match
// "p?ssword1fi", so a deriver that skips NFKC cannot read the file.
export const FIXTURE_PASSPHRASE = "pässｗord１ﬁ";

const payload: SyncPayload = {
  version: SYNC_VERSION,
  updatedAt: "2026-01-01T00:00:00.000Z",
  accounts: [
    {
      type: "totp",
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "GitHub",
      account: "alice@example.com",
      folder: "Work/Dev",
      archived: false,
      pinned: true,
      digits: 6,
      period: 30,
      algorithm: "SHA1",
      counter: 0,
    },
    {
      type: "totp",
      secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      issuer: "Old Service",
      account: "bob",
      folder: "",
      archived: true,
      pinned: false,
      digits: 8,
      period: 30,
      algorithm: "SHA1",
      counter: 0,
    },
    {
      type: "totp",
      secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA",
      issuer: "Bank",
      account: "carol",
      folder: "Personal",
      archived: false,
      pinned: false,
      digits: 6,
      period: 60,
      algorithm: "SHA256",
      counter: 0,
    },
  ],
};

async function main() {
  const envelope = await encryptPayload(payload, FIXTURE_PASSPHRASE, derive, DEFAULT_KDF);
  const dir = resolve(here, "../test/fixtures");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, "extension-sync-file.json"),
    JSON.stringify(envelope, null, 2) + "\n"
  );
  writeFileSync(
    resolve(dir, "extension-sync-file.expected.json"),
    JSON.stringify({ passphrase: FIXTURE_PASSPHRASE, payload }, null, 2) + "\n"
  );
  console.log("fixture written");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});