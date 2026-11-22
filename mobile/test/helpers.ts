import { SyncAccount } from "../../src/models/syncCrypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(text: string): string {
  let bits = "";
  for (const ch of text) {
    bits += ch.charCodeAt(0).toString(2).padStart(8, "0");
  }
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return out;
}

export function makeAccount(over: Partial<SyncAccount> = {}): SyncAccount {
  return {
    type: "totp",
    secret: "JBSWY3DPEHPK3PXP",
    issuer: "Issuer",
    account: "user",
    folder: "",
    archived: false,
    pinned: false,
    digits: 6,
    period: 30,
    algorithm: "SHA1",
    counter: 0,
    ...over,
  };
}

// Cheap deterministic stand-in for Argon2 so tests that only exercise the
// envelope logic stay fast.
export async function fakeDerive(
  passphrase: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  const data = new TextEncoder().encode(passphrase);
  const joined = new Uint8Array(data.length + salt.length);
  joined.set(data);
  joined.set(salt, data.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
}