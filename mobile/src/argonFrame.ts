import { argon2id, argon2Verify } from "hash-wasm";

// Same message protocol as src/argon.ts (the extension's sandbox page), with
// hash-wasm instead of argon2-browser. Parameters and the encoded format are
// identical, so stored password hashes stay valid in both directions.

export interface DeriveRequest {
  id?: unknown;
  pass: string;
  salt: Uint8Array;
  time: number;
  mem: number;
  parallelism: number;
  hashLen: number;
}

export function hash(
  value: string,
  salt: string | Uint8Array
): Promise<string> {
  return argon2id({
    password: value,
    salt,
    iterations: 2,
    memorySize: 1024 * 19,
    parallelism: 1,
    hashLength: 32,
    outputType: "encoded",
  });
}

export async function verify(encoded: string, value: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: value, hash: encoded });
  } catch (e) {
    console.error("Error decoding hash", e);
    return false;
  }
}

export function derive(message: DeriveRequest): Promise<Uint8Array> {
  return argon2id({
    password: message.pass,
    salt: message.salt,
    iterations: message.time,
    memorySize: message.mem,
    parallelism: message.parallelism,
    hashLength: message.hashLen,
    outputType: "binary",
  });
}

type Reply = (data: unknown) => void;

export async function handleMessage(
  message: { action?: string; [key: string]: unknown },
  reply: Reply
): Promise<void> {
  switch (message?.action) {
    case "hash":
      reply({
        response: await hash(
          message.value as string,
          message.salt as string | Uint8Array
        ),
      });
      break;
    case "verify":
      reply({
        response: await verify(message.hash as string, message.value as string),
      });
      break;
    case "derive":
      try {
        reply({
          id: message.id,
          response: await derive((message as unknown) as DeriveRequest),
        });
      } catch {
        reply({ id: message.id, error: true });
      }
      break;
    default:
      break;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    const source = event.source as Window | null;
    if (!source) return;
    handleMessage(event.data, (data) =>
      source.postMessage(data, event.origin)
    ).catch((e) => console.error(e));
  });
}
