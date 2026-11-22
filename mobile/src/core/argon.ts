import { argon2id } from "hash-wasm";
import { KeyDeriver } from "../../../src/models/syncCrypto";

// The passphrase is already NFKC-normalized by syncCrypto.importKey.
export const argonDeriveKey: KeyDeriver = (passphrase, salt, kdf) =>
  argon2id({
    password: passphrase,
    salt,
    parallelism: kdf.parallelism,
    iterations: kdf.timeCost,
    memorySize: kdf.memoryKiB,
    hashLength: kdf.hashLength,
    outputType: "binary",
  });