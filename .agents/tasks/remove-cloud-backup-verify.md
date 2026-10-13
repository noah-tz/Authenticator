# Verification — Remove Cloud Backup (Drive / Dropbox / OneDrive)

Branch: `dev` (confirmed via `git rev-parse --abbrev-ref HEAD` → `dev`).
Platform: Windows / PowerShell. `bash` is not on PATH, so `scripts/build.sh` was not
run; verification uses bash-free `node ./node_modules/...` invocations from the repo
root, exactly as the task specifies.

## 1. Production webpack build (TS + .vue typecheck via fork-ts-checker)

Command:

```
node ./node_modules/webpack-cli/bin/cli.js
```

Output (tail):

```
> webpack 5.94.0 compiled successfully in 10851 ms
```

Exit code 0. No TS errors, no dangling imports after removing the cloud classes/stores.
(Re-run after prettier formatting — still `compiled successfully`.)

## 2. Dev/test webpack build (includes src/test.ts + all *.test.ts)

Command:

```
node ./node_modules/webpack-cli/bin/cli.js --config webpack.dev.js
```

Output (tail):

```
> webpack 5.94.0 compiled successfully in 15553 ms
```

Exit code 0. The removed `store/Backup` import in `MenuPage.test.ts` was cleaned up, so
the test bundle (which would fail on a dangling import) compiles.

## 3. ESLint (.ts only)

Command:

```
node ./node_modules/eslint/bin/eslint.js src --ext .ts
```

Result: **exit code 0**, no output (no lint errors). Note: `.eslintrc` uses
`@typescript-eslint/parser` without `vue-eslint-parser`, so `.vue` script blocks are not
linted here (known limitation); they are type-checked by the webpack builds above.

## 4. Prettier formatting of changed files

Command:

```
node ./node_modules/prettier/bin-prettier.js --write <changed files>
```

All changed `.ts` / `.vue` / `.json` files were formatted; production build re-run after
formatting still `compiled successfully` (section 1).

## 5. Manifest + i18n JSON validity

Command:

```
node -e "['chrome','chrome-testing','edge','firefox','firefox-testing'].forEach(p=>JSON.parse(require('fs').readFileSync('manifests/manifest-'+p+'.json','utf8')));JSON.parse(require('fs').readFileSync('_locales/en/messages.json','utf8'));console.log('JSON OK')"
```

Output: `JSON OK` (exit 0).

Field check (oauth2 removed everywhere, `"identity"` string absent everywhere,
chrome-testing `key` preserved):

```
chrome          oauth2=false hasIdentity=false key=false
chrome-testing  oauth2=false hasIdentity=false key=true
edge            oauth2=false hasIdentity=false key=false
firefox         oauth2=false hasIdentity=false key=false
firefox-testing oauth2=false hasIdentity=false key=false
```

## 6. Reference sweep (grep over src/ and manifests/)

- `models/backup | store/Backup | Dropbox | OneDrive | driveToken | dropboxToken |
  oneDriveToken | driveRefreshToken | oneDriveRefreshToken | oneDriveBusiness |
  driveRevoked | dropboxRevoked | oneDriveRevoked | driveFolder` in `src/`
  → only hits are inside `src/models/credentials.ts` (the intentionally-kept, no-longer
  -imported stub: the `dropbox` / `onedrive` object keys). No live references.
- `getBackupToken | uploadBackup | runScheduledBackup | drivetoken | backup/setToken |
  backup/setEnc | state.backup | backupDisabled | disableBackup | chrome.identity |
  getCredentials` in `src/`
  → only hit is `export function getCredentials()` in the kept stub. No callers.
- `googleapis | dropboxapi | graph.microsoft | microsoftonline | oauth2/revoke` in
  `src/` and `manifests/` → **no matches**.
- `www.google.com | generate_204` in `src/` and `manifests/` → clock-sync hits ONLY
  (`src/syncTime.ts`, `src/popup.ts`, `src/store/Permissions.ts`,
  `src/components/Popup/MenuPage.vue`, and the kept `https://www.google.com/` manifest
  host + connect-src entries). These are EXPECTED and intentionally preserved.

## Preserved (not regressed)

- `chrome.storage.sync` account syncing / storageLocation toggle (`EntryStorage`,
  `BrowserStorage`, `UserSettings` load/commit) — untouched; `UserSettings` iterates keys
  generically so pre-existing `driveToken`/etc. in a user's storage load without error
  (backward compatible, no migration performed).
- File export/import (`BackupPage.vue` file section, `Import.vue`, `src/import.ts`),
  QR import, folders / nested folders / expand-collapse-all, archive.
- Google clock sync (`syncTime.ts`, `https://www.google.com/`, `permission_sync_clock`).
- MIT LICENSE and the "Authenticator Folders" rebrand.
