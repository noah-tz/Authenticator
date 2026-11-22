import { BrowserStorage, isOldKey } from "./storage";

export async function argonHash(
  value: string,
  salt: string
): Promise<string | undefined> {
  const iframe = document.getElementById("argon-sandbox");
  const message = {
    action: "hash",
    value,
    salt,
  };

  if (!iframe) {
    throw new Error("argon-sandbox missing!");
  }

  const argonPromise: Promise<string | undefined> = new Promise((resolve) => {
    window.addEventListener("message", (response) => {
      resolve(response.data.response);
    });
    // @ts-expect-error bad typings
    iframe.contentWindow.postMessage(message, "*");
  });

  return argonPromise;
}

export async function argonVerify(
  value: string,
  hash: string
): Promise<boolean> {
  const iframe = document.getElementById("argon-sandbox");
  const message = {
    action: "verify",
    value,
    hash,
  };

  if (!iframe) {
    throw new Error("argon-sandbox missing!");
  }

  const argonPromise: Promise<boolean> = new Promise((resolve) => {
    window.addEventListener("message", (response) => {
      resolve(response.data.response);
    });
    // @ts-expect-error bad typings
    iframe.contentWindow.postMessage(message, "*");
  });

  return argonPromise;
}

// Verify a password using keys in BrowserStorage
export async function verifyPasswordUsingKeyID(
  keyId: string,
  password: string
): Promise<boolean> {
  // Get key for current encryption
  const keys = await BrowserStorage.getKeys();
  if (isOldKey(keys)) {
    throw new Error(
      "v3 encryption not being used with verifyPassword. This should never happen!"
    );
  }

  const key = keys.find((key) => key.id === keyId);
  if (!key) {
    throw new Error(`Key ${keyId} not in BrowserStorage`);
  }

  return verifyPasswordUsingKey(key, password);
}

export async function verifyPasswordUsingKey(
  key: Key,
  password: string
): Promise<boolean> {
  // Hash password with argon
  const rawHash = await argonHash(password, key.salt);
  if (!rawHash) {
    throw new Error("argon2 did not return a hash!");
  }
  // https://passlib.readthedocs.io/en/stable/lib/passlib.hash.argon2.html#format-algorithm
  const possibleHash = rawHash.split("$")[5];

  // verify user password by comparing their password hash with the
  // hash of their password's hash
  return await argonVerify(possibleHash, key.hash);
}

export interface DeriveParams {
  timeCost: number;
  memoryKiB: number;
  parallelism: number;
  hashLength: number;
}

// Derives a raw key with Argon2id in the sandbox. Unlike argonHash this
// takes explicit parameters and returns the raw hash bytes.
export function argonDeriveKey(
  passphrase: string,
  salt: Uint8Array,
  p: DeriveParams
): Promise<Uint8Array> {
  const iframe = document.getElementById(
    "argon-sandbox"
  ) as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentWindow) {
    return Promise.reject(new Error("argon-sandbox missing!"));
  }
  const target = iframe.contentWindow;
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("message", listener);
      clearTimeout(timer);
    };
    const listener = (event: MessageEvent) => {
      if (!event.data || event.data.id !== id) {
        return;
      }
      cleanup();
      if (event.data.error || !event.data.response) {
        reject(new Error("argon2 did not return a key"));
        return;
      }
      resolve(new Uint8Array(event.data.response));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("argon2 timed out"));
    }, 60000);
    window.addEventListener("message", listener);
    target.postMessage(
      {
        action: "derive",
        id,
        pass: passphrase,
        salt,
        time: p.timeCost,
        mem: p.memoryKiB,
        parallelism: p.parallelism,
        hashLen: p.hashLength,
      },
      "*"
    );
  });
}
