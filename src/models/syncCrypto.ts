// Encrypted sync file: plain JSON envelope + AES-256-GCM ciphertext.
// Format is documented in docs/sync-format.md. Keep the two in step.

export const SYNC_FORMAT = "authenticator-folders-sync";
export const SYNC_VERSION = 1;
export const SYNC_AAD = `${SYNC_FORMAT}:${SYNC_VERSION}`;

export const DEFAULT_KDF = {
  timeCost: 2,
  memoryKiB: 19456,
  parallelism: 1,
  hashLength: 32,
};

// Bounds enforced on files read from Drive (untrusted input).
export const KDF_BOUNDS = {
  maxTimeCost: 10,
  maxMemoryKiB: 256 * 1024,
  maxParallelism: 8,
};

export interface SyncAccount {
  type: string;
  secret: string;
  issuer: string;
  account: string;
  folder: string;
  archived: boolean;
  pinned: boolean;
  digits: number;
  period: number;
  algorithm: string;
  counter: number;
}

export interface SyncPayload {
  version: number;
  updatedAt: string;
  accounts: SyncAccount[];
}

export interface KdfParams {
  timeCost: number;
  memoryKiB: number;
  parallelism: number;
  hashLength: number;
}

export interface SyncEnvelope {
  format: string;
  version: number;
  kdf: {
    name: "argon2id";
    version: 19;
    timeCost: number;
    memoryKiB: number;
    parallelism: number;
    hashLength: number;
    salt: string;
  };
  cipher: {
    name: "AES-256-GCM";
    iv: string;
    tagLength: 128;
  };
  ciphertext: string;
}

export type KeyDeriver = (
  passphrase: string,
  salt: Uint8Array,
  kdf: KdfParams
) => Promise<Uint8Array>;

export type SyncErrorCode =
  | "BAD_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "BAD_KDF_PARAMS"
  | "WRONG_PASSPHRASE";

export class SyncError extends Error {
  code: SyncErrorCode;
  constructor(code: SyncErrorCode, message?: string) {
    super(message || code);
    this.code = code;
    // keep instanceof working when compiled to ES5
    Object.setPrototypeOf(this, SyncError.prototype);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  if (typeof text !== "string") {
    throw new SyncError("BAD_FORMAT");
  }
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    throw new SyncError("BAD_FORMAT");
  }
}

async function importKey(
  derive: KeyDeriver,
  passphrase: string,
  salt: Uint8Array,
  kdf: KdfParams
) {
  const raw = await derive(passphrase.normalize("NFKC"), salt, kdf);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptPayload(
  payload: SyncPayload,
  passphrase: string,
  derive: KeyDeriver,
  kdf: KdfParams = DEFAULT_KDF
): Promise<SyncEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(derive, passphrase, salt, kdf);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      tagLength: 128,
      additionalData: new TextEncoder().encode(SYNC_AAD),
    },
    key,
    plaintext
  );
  return {
    format: SYNC_FORMAT,
    version: SYNC_VERSION,
    kdf: {
      name: "argon2id",
      version: 19,
      timeCost: kdf.timeCost,
      memoryKiB: kdf.memoryKiB,
      parallelism: kdf.parallelism,
      hashLength: kdf.hashLength,
      salt: toBase64(salt),
    },
    cipher: { name: "AES-256-GCM", iv: toBase64(iv), tagLength: 128 },
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

function isInt(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function parseEnvelope(text: string): SyncEnvelope {
  let data: SyncEnvelope;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new SyncError("BAD_FORMAT");
  }
  if (!data || typeof data !== "object" || data.format !== SYNC_FORMAT) {
    throw new SyncError("UNSUPPORTED_VERSION", "Not a sync file");
  }
  if (data.version !== SYNC_VERSION) {
    throw new SyncError("UNSUPPORTED_VERSION");
  }
  if (!data.kdf || !data.cipher || typeof data.ciphertext !== "string") {
    throw new SyncError("BAD_FORMAT");
  }
  return data;
}

export async function decryptEnvelope(
  envelope: SyncEnvelope,
  passphrase: string,
  derive: KeyDeriver
): Promise<SyncPayload> {
  if (!envelope || envelope.format !== SYNC_FORMAT) {
    throw new SyncError("UNSUPPORTED_VERSION");
  }
  if (envelope.version !== SYNC_VERSION) {
    throw new SyncError("UNSUPPORTED_VERSION");
  }
  const { kdf, cipher } = envelope;
  if (!kdf || !cipher) {
    throw new SyncError("BAD_FORMAT");
  }
  if (
    kdf.name !== "argon2id" ||
    kdf.version !== 19 ||
    !isInt(kdf.timeCost, 1, KDF_BOUNDS.maxTimeCost) ||
    !isInt(kdf.memoryKiB, 8, KDF_BOUNDS.maxMemoryKiB) ||
    !isInt(kdf.parallelism, 1, KDF_BOUNDS.maxParallelism) ||
    kdf.hashLength !== 32
  ) {
    throw new SyncError("BAD_KDF_PARAMS");
  }
  if (cipher.name !== "AES-256-GCM" || cipher.tagLength !== 128) {
    throw new SyncError("BAD_FORMAT");
  }
  const salt = fromBase64(kdf.salt);
  const iv = fromBase64(cipher.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  if (salt.length < 8 || iv.length !== 12 || ciphertext.length < 16) {
    throw new SyncError("BAD_FORMAT");
  }
  const key = await importKey(derive, passphrase, salt, {
    timeCost: kdf.timeCost,
    memoryKiB: kdf.memoryKiB,
    parallelism: kdf.parallelism,
    hashLength: kdf.hashLength,
  });
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128,
        additionalData: new TextEncoder().encode(SYNC_AAD),
      },
      key,
      ciphertext
    );
  } catch (e) {
    throw new SyncError("WRONG_PASSPHRASE");
  }
  let payload: SyncPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch (e) {
    throw new SyncError("BAD_FORMAT");
  }
  if (!payload || !Array.isArray(payload.accounts)) {
    throw new SyncError("BAD_FORMAT");
  }
  return payload;
}
