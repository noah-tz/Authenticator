# Sync file format (version 1)

This describes the file the Authenticator Folders extension writes to Google Drive. It is plain JSON, so any platform (Android, iOS, desktop) can read and write it. Implementation: `src/models/syncCrypto.ts`.

## Location

- Drive API v3, `spaces=appDataFolder`, scope `https://www.googleapis.com/auth/drive.appdata`.
- File name: `authenticator-folders-sync.json`, MIME type `application/json`.
- The app-data folder is private to the OAuth client. A mobile app must use an OAuth client of the same Google Cloud project to see the same file.

## Envelope

```json
{
  "format": "authenticator-folders-sync",
  "version": 1,
  "kdf": {
    "name": "argon2id",
    "version": 19,
    "timeCost": 2,
    "memoryKiB": 19456,
    "parallelism": 1,
    "hashLength": 32,
    "salt": "<base64>"
  },
  "cipher": {
    "name": "AES-256-GCM",
    "iv": "<base64>",
    "tagLength": 128
  },
  "ciphertext": "<base64>"
}
```

- All base64 is standard alphabet (RFC 4648 section 4) with `=` padding.
- `salt`: 16 random bytes, used as the raw Argon2 salt bytes (not as text).
- `iv`: 12 random bytes. A fresh salt and IV are generated for every upload.
- `ciphertext`: the AES-GCM output, ciphertext followed by the 16-byte tag.

## Key derivation

1. Take the passphrase and apply Unicode NFKC normalization, then encode as UTF-8.
2. Argon2id (version 0x13) with the `timeCost`, `memoryKiB`, `parallelism` and `salt` from the file. Output length is `hashLength` = 32 bytes. The output is the raw AES-256 key.

The extension writes `timeCost 2`, `memoryKiB 19456`, `parallelism 1`. Readers must use the values in the file, but must reject files outside these bounds (the file is untrusted input):

- `timeCost` 1 to 10
- `memoryKiB` 8 to 262144 (256 MiB)
- `parallelism` 1 to 8
- `hashLength` exactly 32

## Encryption

AES-256-GCM, 12-byte IV, 128-bit tag, additional authenticated data (AAD) = the UTF-8 bytes of `authenticator-folders-sync:1` (format, a colon, the version). A failed tag check means a wrong passphrase or a damaged file; the two cannot be told apart.

## Plaintext

UTF-8 JSON:

```json
{
  "version": 1,
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "accounts": [
    {
      "type": "totp",
      "secret": "JBSWY3DPEHPK3PXP",
      "issuer": "Example",
      "account": "user@example.com",
      "folder": "Work/Email",
      "archived": false,
      "pinned": false,
      "digits": 6,
      "period": 30,
      "algorithm": "SHA1",
      "counter": 0
    }
  ]
}
```

- `type`: `totp`, `hotp`, `battle`, `steam`, `hex` or `hhex`.
- `algorithm`: `SHA1`, `SHA256`, `SHA512`, `GOST3411_2012_256` or `GOST3411_2012_512`.
- `folder`: a path with `/` as separator (nested folders). Empty string means no folder. Segments are trimmed and empty segments dropped when compared.
- `archived`: the account is in the archive.
- There is no internal id. Accounts are matched by content.

## Matching accounts

Two accounts are the same account when `type` is equal and the secrets are equal after removing whitespace and `=` and upper-casing. Never match on any device-local id. If the same key appears twice on one side, the first entry wins.

When a matched pair differs in `issuer`, `account`, `folder`, `archived`, `pinned`, `digits`, `period`, `algorithm` or `counter`, that is a difference on an existing account, not a new account.

## Conflict choices

Sync is manual. When both sides differ, nothing is written until the user picks one. "Source" is the side being copied from, "target" the side being written.

- Add only what is missing: source-only accounts are added to the target. Nothing is overwritten or deleted.
- Overwrite: the above, plus matched accounts on the target take the source's values. Target-only accounts are kept.
- Delete what is missing: the above, plus target-only accounts are deleted, so the target equals the source.

## Versioning

Readers must reject any `format` other than `authenticator-folders-sync` and any `version` they do not know. Changes that break this layout increase `version`.
