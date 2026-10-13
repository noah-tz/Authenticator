# Implementation Plan — Remove Cloud Backup (Drive / Dropbox / OneDrive)

Goal: Remove the three cloud-provider backup/restore integrations (Google Drive, Dropbox,
OneDrive) from the "Authenticator Folders" extension. Keep everything else working:
`chrome.storage.sync` account syncing (sync/local storage location, `EntryStorage`,
`BrowserStorage`), manual file export/import (`BackupPage` file section, `Import.vue`,
`src/import.ts`), the Google **clock-sync** feature (`syncTime.ts`, `https://www.google.com/`),
folders / nested folders / expand-collapse-all, archive, and the MIT LICENSE + rebrand.

## Scope decisions (made during exploration, grounded in the code)

- **`identity` permission is cloud-only → remove it.** The only uses of `chrome.identity`
  (`getAuthToken`, `launchWebAuthFlow`, `getRedirectURL`, `removeCachedAuthToken`) live inside
  the cloud-backup flow in `src/background.ts` and the three `*Page.vue` files, all of which are
  being removed. Clock sync (`syncTime.ts`) uses `https://www.google.com/generate_204` and the
  `https://www.google.com/` host permission — NOT identity. So `identity` and its i18n/permission
  entries are removed on every platform.
- **Keep `https://www.google.com/`** host permission + connect-src + `permission_sync_clock`:
  used by clock sync, not backup.
- **Delete `src/store/Backup.ts` entirely.** Its state is 100% cloud (`driveToken`,
  `dropboxToken`, `oneDriveToken`, `*Encrypted`) and its only consumers are the removed
  `*Page.vue` files, `MainHeader.vue` (the `#i-sync` icon), and `popup.ts`
  (`runScheduledBackup`). Nothing non-cloud reads it.
- **Delete `src/models/backup.ts` entirely.** It only defines the `Dropbox`/`Drive`/`OneDrive`
  classes. The `BackupProvider` interface in `src/definitions/BackupProvider.d.ts` is only
  implemented by those classes — remove that definition file too.
- **Keep `src/models/credentials.ts` as-is (stub).** `getCredentials()` already returns empty
  strings; after removing its callers it becomes dead but harmless. Leaving it avoids touching
  `scripts/build.sh`'s `CREDREGEX` credential check (which greps the file's shape) and the
  `scripts/credentials.ts.gpg` the task says not to touch. It will no longer be imported, so also
  remove the now-unused `import { getCredentials }` lines from `background.ts` (and it was already
  only used by `backup.ts`).
- **`backupDisabled` / `disableBackup` managed-storage flag:** only consumer is the 3rd-party
  services block in `BackupPage.vue`, which is being removed. Remove `backupDisabled` from the
  `Menu` store state and the `MenuState` interface. (`exportDisabled` / `disableExport` stays — it
  gates the file-export section we keep.)
- **`UserSettings` cloud fields:** stop reading/writing them (remove all references) but it is
  **safe to leave the field declarations** in the `UserSettingsData` interface and the
  `LocalUserSettingsDataKeys` / option-type arrays. Reason: `splitSettings`, `convertFromLocalStorage`,
  and `removeItem` iterate generically over whatever keys exist; a user with pre-existing
  `driveToken` etc. in storage must still load/commit without crashing. Removing the field
  *declarations* is optional cleanup; the plan removes the clearly cloud-only ones but keeps load/
  commit generic. (See step 7 for the exact, conservative edit.)
- **i18n:** remove the clearly cloud-only keys from `_locales/en/messages.json` only (English is
  the `default_locale`; other locales may lag but unused keys are harmless — do NOT bulk-edit every
  locale). Keep `remind_backup` (generic "do you have a backup?" reminder, still shown) — see
  step 4.

## Baseline (verified before planning)

On branch `dev`, both `npx webpack --config ./webpack.config.js` and
`npx webpack --config ./webpack.dev.js` compile successfully (the latter includes `src/test.ts`
and all `src/test/**/*.test.ts`). `fork-ts-checker-webpack-plugin` typechecks `.ts` **and** `.vue`
files during these builds, so webpack compiling clean is the real type/compile verification.
`bash` is NOT on PATH here, so `scripts/build.sh` cannot run directly — verify with the two
`npx webpack` commands and `npx eslint` instead.

**Primary verify command (run after each step that changes `src/`):**
`npx webpack --config ./webpack.dev.js`  → expect `compiled successfully`, zero TS errors.

---

## Steps

- [ ] 1. Delete the cloud-backup model and its interface definition.
      Delete `src/models/backup.ts` (the `Dropbox`/`Drive`/`OneDrive` classes) and
      `src/definitions/BackupProvider.d.ts` (only implemented by those classes).
      Files: remove `src/models/backup.ts`, remove `src/definitions/BackupProvider.d.ts`.
      Verify: do not build yet (importers still reference it); proceed to steps 2-3 which remove
      the importers, then build. (This step + 2 + 3 together must land before the first build.)

- [ ] 2. Strip cloud backup out of `src/background.ts`.
      Remove `import { Dropbox, Drive, OneDrive } from "./models/backup";` and
      `import { getCredentials } from "./models/credentials";` (only used by the removed code).
      In the `onMessage` listener, delete the
      `else if (["dropbox","drive","onedrive"].indexOf(message.action) > -1) { getBackupToken(...) }`
      branch. Delete the entire `getBackupToken()` and `uploadBackup()` functions (including the
      `chrome.identity.getAuthToken` / `launchWebAuthFlow` logic and the `drivetoken` runtime
      message, which has no listener). Leave `isChrome`/`isFirefox` imports only if still used
      elsewhere in the file; if `getBackupToken` was their only consumer, remove the now-unused
      import (check: `isChrome`/`isFirefox` — remove whichever becomes unused).
      Files: `src/background.ts`.
      Verify: part of the step-3 build.

- [ ] 3. Remove cloud backup from `src/popup.ts` and build the first green checkpoint.
      Remove `import { Backup } from "./store/Backup";` and
      `import { Dropbox, Drive, OneDrive } from "./models/backup";`. Remove
      `backup: await new Backup().getModule(),` from the Vuex `modules` object. Delete the entire
      `runScheduledBackup` function and the `backupReminder` `setInterval` block that calls it.
      Replace the backup-reminder logic with a simple generic reminder that keeps the existing
      "do you have a backup?" nudge without any cloud upload: inside the interval, after the
      encryption/entries guards, keep the `lastRemindingBackupTime` bookkeeping and, when 30+ days
      have passed, `instance.$store.commit("notification/alert", instance.i18n.remind_backup)` then
      update `lastRemindingBackupTime`. (Do NOT reference `instance.$store.state.backup`.) Keep the
      `syncTimeWithGoogle()` block and the `https://www.google.com/` permission check untouched.
      Files: `src/popup.ts`.
      Verify: `npx webpack --config ./webpack.config.js` → compiled successfully (production entry
      set now has no dangling backup imports).

- [ ] 4. Keep `remind_backup`; confirm it is the only surviving backup-reminder path.
      No code change expected beyond step 3. Confirm `instance.i18n.remind_backup` still resolves
      (the key stays in `_locales/en/messages.json`). This item exists to prevent accidentally
      deleting `remind_backup` in step 11.
      Files: none (verification only).
      Verify: `npx webpack --config ./webpack.config.js` still green; grep that `remind_backup`
      has exactly one JSON definition and at least one usage.

- [ ] 5. Delete the three cloud provider UI pages and their routing registration.
      Delete `src/components/Popup/DrivePage.vue`, `src/components/Popup/DropboxPage.vue`,
      `src/components/Popup/OneDrivePage.vue`. In `src/components/Popup/PageHandler.vue` remove the
      three `import ... from "./{Drive,Dropbox,OneDrive}Page.vue";` lines and the three entries in
      the `components: { ... }` object.
      Files: remove the 3 `*Page.vue`; edit `src/components/Popup/PageHandler.vue`.
      Verify: part of step 6 build.

- [ ] 6. Remove the "3rd Party Backup Services" section from `BackupPage.vue` (keep the file-based
      export/import section — that is the generic local backup page the task says to KEEP).
      In `src/components/Popup/BackupPage.vue`: delete the entire
      `<!-- 3rd Party Backup Services -->` `<div v-show="!backupDisabled && isBackupServiceSupported">`
      block (the Google Drive / OneDrive / Dropbox `<a-button @click="showInfo(...)">` buttons and
      the `storage_sync_info` text). Delete the `showInfo()` method (it only requested
      dropbox/drive/onedrive host permissions and switched to the removed pages). Delete the now
      -unused computed props `backupDisabled` and `isBackupServiceSupported`. Keep `exportDisabled`,
      `defaultEncryption`, `currentlyEncrypted`, `isDataLinkSupported`, all `download*` methods, the
      file export links, and the `import.html` import button.
      Files: `src/components/Popup/BackupPage.vue`.
      Verify: `npx webpack --config ./webpack.config.js` → compiled successfully.

- [ ] 7. Remove the `#i-sync` cloud icon from the main header and its backup store binding.
      In `src/components/Popup/MainHeader.vue`: delete the `<div class="icon" id="i-sync" ...>`
      block (shown when `dropboxToken || driveToken || oneDriveToken`) including its `<IconSync />`.
      Remove `mapState("backup", ["driveToken", "dropboxToken", "oneDriveToken"])` from
      `computedPrototype`. Remove the now-unused `import IconSync from "../../../svg/sync.svg";` and
      the `IconSync` entry in `components`. Leave the folders/qr/edit/lock/plus/cog icons intact.
      (Note: `MenuPage.vue` separately imports `IconSync` for the clock-sync menu item — that is a
      different file and must stay.)
      Files: `src/components/Popup/MainHeader.vue`.
      Verify: `npx webpack --config ./webpack.config.js` → compiled successfully.

- [ ] 8. Delete the `Backup` Vuex store and its type.
      Delete `src/store/Backup.ts`. In `src/definitions/module-interface.d.ts` remove the
      `interface BackupState { ... }` block (only used by the deleted store and
      `MainHeader`/`*Page.vue`). Also remove `backupDisabled: boolean;` from `interface MenuState`.
      Files: remove `src/store/Backup.ts`; edit `src/definitions/module-interface.d.ts`.
      Verify: part of step 9 build (the test still imports the store until step 9).

- [ ] 9. Fix the test that registers the removed `Backup` store, then run the first test-inclusive
      build.
      In `src/test/components/Popup/MenuPage.test.ts` remove
      `import { Backup } from "../../../store/Backup";` and the
      `backup: await new Backup().getModule(),` line in the `feedbackURL is set` store setup.
      `MenuPage.vue` does not use the backup store, so the test behavior is unchanged.
      Files: `src/test/components/Popup/MenuPage.test.ts`.
      Verify: `npx webpack --config ./webpack.dev.js` → compiled successfully (this entry includes
      `src/test.ts` and all `*.test.ts`, so a dangling `store/Backup` import would fail the TS
      check here).

- [ ] 10. Remove `backupDisabled` from the `Menu` store state.
      In `src/store/Menu.ts` delete the line
      `backupDisabled: await ManagedStorage.get("disableBackup", false),` from the `state` object.
      Keep `exportDisabled`, `enforcePassword`, etc. (The `MenuState` field was already removed in
      step 8; this removes the value.)
      Files: `src/store/Menu.ts`.
      Verify: `npx webpack --config ./webpack.dev.js` → compiled successfully.

- [ ] 11. Remove cloud-only permission entries from the Permissions store and their i18n.
      In `src/store/Permissions.ts` delete these permission objects from the `permissions` array:
      the `identity` entry; `https://*.dropboxapi.com/*`; `https://www.googleapis.com/*`;
      `https://accounts.google.com/*`; `https://graph.microsoft.com/*`;
      `https://login.microsoftonline.com/*` (all five host entries carry cloud `validation` that
      reads `driveToken`/`oneDriveToken`/`dropboxToken`). KEEP `activeTab`, `storage`, `alarms`,
      `scripting`, `clipboardWrite`, `contextMenus`, and `https://www.google.com/*` (clock sync).
      Then remove the now-unused `import { UserSettings } from "../models/settings";` if nothing
      else in the file uses it (the deleted validators were its only consumers — confirm and
      remove).
      In `_locales/en/messages.json` remove the cloud-only keys: `permission_identity`,
      `permission_dropbox`, `permission_dropbox_cannot_revoke`, `permission_drive`,
      `permission_drive_cannot_revoke`, `permission_onedrive`, `permission_onedrive_cannot_revoke`,
      `dropbox_risk`, `manual_dropbox`, `storage_sync_info`, `sign_in`, `sign_in_business`,
      `onedrive_business_perms`, `log_out`, `token_revoked`. KEEP `permission_sync_clock`,
      `permission_storage`, `permission_active_tab`, `permission_alarms`, `permission_scripting`,
      `permission_clipboard_write`, `permission_context_menus`, `remind_backup`, and all
      file-backup keys (`backup`, `backup_file_info`, `download_backup`, `download_enc_backup`,
      `import_backup`, `export_info`, `phrase_incorrect_export`, `otp_unsupported_warn`).
      Before removing each key, grep `src` to confirm it is unreferenced after steps 1-10 (e.g.
      `sign_in`, `log_out`, `account`, `encrypted`, `yes`, `no` may be shared — only remove keys
      that grep shows are now cloud-only; if `sign_in`/`log_out`/`account`/`encrypted` are used by
      other kept UI, leave them).
      Files: `src/store/Permissions.ts`, `_locales/en/messages.json`.
      Verify: `npx webpack --config ./webpack.dev.js` → compiled successfully; `_locales/en/
      messages.json` is still valid JSON (the build's `require.context` / i18n loader parses it —
      a green dev build confirms validity).

- [ ] 12. Strip cloud keys from all five manifests, consistently per platform.
      Apply to `manifests/manifest-chrome.json`, `manifests/manifest-chrome-testing.json`,
      `manifests/manifest-edge.json`, `manifests/manifest-firefox.json`,
      `manifests/manifest-firefox-testing.json`:
      - Remove the top-level `"oauth2"` block (Google client_id + drive.file scope) where present
        (chrome, chrome-testing, edge). firefox / firefox-testing have no `oauth2`.
      - Remove `"identity"` from the `"permissions"` array (all five list it).
      - Host permissions: in the host list (`optional_host_permissions` for chrome/chrome-testing/
        edge; `host_permissions` for firefox MV3; `optional_permissions` for firefox-testing MV2)
        remove `https://*.dropboxapi.com/*`, `https://www.googleapis.com/*`,
        `https://accounts.google.com/o/oauth2/revoke`, `https://graph.microsoft.com/me/*`,
        `https://login.microsoftonline.com/common/oauth2/v2.0/token`. **KEEP**
        `https://www.google.com/` (clock sync). If removing those leaves the host array containing
        only `https://www.google.com/`, keep the array with that single entry.
      - `content_security_policy` `connect-src`: drop `https://*.dropboxapi.com`,
        `https://www.googleapis.com/`, `https://accounts.google.com/o/oauth2/revoke`,
        `https://login.microsoftonline.com/common/oauth2/v2.0/token`, `https://graph.microsoft.com/`
        from the `connect-src` list in every manifest (chrome/edge/chrome-testing use the object
        form `content_security_policy.extension_pages`; firefox uses `extension_pages`;
        firefox-testing uses the MV2 string form). **KEEP** `connect-src https://www.google.com/`
        (clock sync) and leave `script-src`/`font-src`/`img-src`/`style-src`/`default-src` as-is.
      - KEEP `storage`, `alarms`, `scripting`, `activeTab`, `clipboardWrite`, `contextMenus`,
        `sandbox`, `options_ui`, `storage.managed_schema`, and the firefox-testing MV2
        `<all_urls>`/`browser_action` entries untouched.
      - Do NOT change `version`, `name`, icons, commands, or the chrome-testing `"key"`.
      Files: the five `manifests/manifest-*.json`.
      Verify: each edited manifest is valid JSON — run
      `node -e "['chrome','chrome-testing','edge','firefox','firefox-testing'].forEach(p=>JSON.parse(require('fs').readFileSync('manifests/manifest-'+p+'.json','utf8')))"`
      → exits 0 with no output. Then grep (step 13) confirms no cloud endpoints remain.

- [ ] 13. Final full build + reference sweep (no code change unless the sweep finds a straggler).
      Run the full green verification and a grep checklist to prove no cloud-backup references
      survive outside the intentionally-kept stub (`credentials.ts`) and `remind_backup`.
      Files: none (unless a straggler is found, then fix in the owning file and re-verify).
      Verify (all must hold):
      - `npx webpack --config ./webpack.config.js` → compiled successfully.
      - `npx webpack --config ./webpack.dev.js` → compiled successfully (tests included).
      - `npx eslint . --ext .js,.ts` → no errors (matches what `scripts/build.sh` runs).
      - Grep checklist (expect **no matches** in `src/` except as noted):
        - `grep -ri "models/backup" src` → none.
        - `grep -ri "store/Backup" src` → none.
        - `grep -rin "Dropbox\|OneDrive" src` → none (class/page refs gone).
        - `grep -rin "driveToken\|dropboxToken\|oneDriveToken\|driveRefreshToken\|oneDriveRefreshToken\|oneDriveBusiness\|driveRevoked\|dropboxRevoked\|oneDriveRevoked\|driveFolder" src`
          → only acceptable remaining hits are the field *declarations* in `src/models/settings.ts`
          (and its option arrays) if they were intentionally kept per the step-7 scope decision;
          no reads/writes elsewhere.
        - `grep -rin "getBackupToken\|uploadBackup\|runScheduledBackup\|drivetoken\|backup/setToken\|backup/setEnc\|state.backup\|backupDisabled\|disableBackup" src`
          → none.
        - `grep -rin "chrome.identity" src` → none.
        - `grep -rin "getCredentials" src` → none (credentials.ts kept but no longer imported).
        - `grep -rin "googleapis\|dropboxapi\|graph.microsoft\|microsoftonline\|oauth2/revoke" src manifests`
          → none.
        - `grep -rin "google.com/generate_204\|www.google.com" src manifests` → clock-sync hits
          only (`syncTime.ts`, the kept `https://www.google.com/` manifest entries) — these are
          EXPECTED and must remain.
        - `grep -rin "identity" manifests` → none.

## Settings model edit (referenced by step 7 scope decision) — exact, conservative version

Perform as part of step 11's cleanup pass OR as its own edit; either way keep `UserSettings`
load/commit generic:
- In `src/models/settings.ts` it is SAFE to remove the cloud field declarations
  (`driveEncrypted`, `driveFolder`, `driveRefreshToken`, `driveRevoked`, `driveToken`,
  `dropboxEncrypted`, `dropboxRevoked`, `dropboxToken`, `lastRemindingBackupTime` — see note,
  `oneDriveBusiness`, `oneDriveEncrypted`, `oneDriveRevoked`, `oneDriveRefreshToken`,
  `oneDriveToken`) from the `UserSettingsData` interface, from `LocalUserSettingsDataKeys`, and
  from the `BooleanOption`/`NumberOption` type unions + their runtime `isBooleanOption`/
  `isNumberOption` arrays — BUT this is optional. Because `splitSettings`/`convertFromLocalStorage`
  iterate `for (key in storageData)` generically, pre-existing cloud keys in a user's storage are
  still preserved/split correctly even if undeclared. **Do not remove `offset`, `storageLocation`,
  `autofill`, `autolock`, `enableContextMenu`, `encodedPhrase`, `smartFilter`, `theme`, `zoom`,
  `advisorIgnoreList`.**
- `lastRemindingBackupTime`: KEEP it. Step 3's generic reminder still reads/writes it. (It is a
  local, number setting.) Do not remove `lastRemindingBackupTime` from the interface, from
  `LocalUserSettingsDataKeys`, from `NumberOption`, or from `isNumberOption`.
- If choosing to remove the cloud field declarations, do it in this same step and re-run
  `npx webpack --config ./webpack.dev.js` to confirm no `src/` code still references a removed
  field (there should be none after steps 1-11). If any reference remains, that is a straggler to
  fix, not a reason to re-add the field.

## Backward compatibility note (must hold at the end)

A user whose stored `UserSettings` still contains `driveToken`/`dropboxToken`/`oneDriveToken`/etc.
must load without error: nothing reads those keys anymore, `getAllItems`/`splitSettings` handle
unknown keys generically, and the removed `#i-sync` icon / `runScheduledBackup` no longer run. No
migration or deletion of existing stored tokens is performed (keeps the change reversible and
crash-free whether the keys are absent or present-but-ignored). `chrome.storage.sync` account
syncing and the sync/local storageLocation toggle are untouched.
