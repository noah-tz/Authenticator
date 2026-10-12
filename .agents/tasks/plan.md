# Implementation Plan — Folders feature (Authenticator fork)

All paths are absolute and under the worktree
`c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders`. Do NOT edit the
user's checkout at `c:\Users\Noah\Documents\projects\Authenticator`.

## Design decisions (made here, grounded in the code)

- **Mirror `pinned` everywhere.** `folder` is a per-entry string that rides inside the
  existing per-entry `OTPStorage` object in `chrome.storage.sync`. Reads are defensive and
  writes are additive, so no migration is needed and existing synced data stays compatible
  (verified in `src/models/storage.ts` `EntryStorage.get` and `getOTPStorageFromEntry`).
- **Default value is empty string `""`** (not `undefined`), matching how `issuer`/`account`
  are defaulted in `src/models/otp.ts`. An empty/absent `folder` means "ungrouped".
- **Write only when set.** `getOTPStorageFromEntry` emits `folder` only when truthy, exactly
  like `if (entry.pinned) storageItem.pinned = true;`. Untouched entries keep their exact
  current bytes.
- **Export/backup carry-through.** `getExport` round-trips `folder` for free (it calls
  `getOTPStorageFromEntry`). `backupGetExport` currently strips `pinned` with
  `delete entry.pinned;`; we deliberately do NOT add `delete entry.folder;`, so cloud/file
  backups preserve folder. `import` maps `folder` through so re-import restores it. Exports
  consumed by the original extension simply ignore the unknown field.
- **Folders set is derived, no registry (MVP).** A `folders` getter computes the distinct,
  sorted set of non-empty `folder` strings present on entries. Matches the brief; keeps
  `chrome.storage.sync` payloads minimal.
- **Collapse state lives in the Accounts store, not synced.** Added as
  `collapsedFolders: string[]` on `AccountsState` with a `toggleFolderCollapsed` mutation.
  It is view-only; it is never persisted to storage, so it does not sync. (Chose Accounts
  over Style because the data is folder-domain, co-located with the `folders` getter.)
- **Accordion is a presentation layer, not interleaved dragula rows.** Per the investigation,
  injecting group headers into the single dragula list fights the drake. Instead `MainBody.vue`
  renders one collapsible `<section>` per folder (ungrouped first, then sorted folders), each
  containing its own `EntryComponent` list filtered to that folder. The default `entries`
  getter stays pinned-first and unchanged; grouping is layered on top.
- **Drag scope.** To avoid breaking the existing drake, keep a single `v-dragula` list over the
  full pinned-first `entries` when NO folders exist (unchanged behavior). When folders exist and
  the accordion renders, scope drag-reorder to within a folder section (each section is its own
  dragula list keyed by folder) OR, if per-section drakes prove flaky in the time box, disable
  cross-folder drag and document it in the FEAT `findings`. Do NOT silently break the existing
  single-list reorder.
- **Assign UI = free-text input + datalist.** Simplest and matches inline-edit style. A row's
  inline-edit area (shown while `style.isEditing`) gets a folder text input bound to a
  `<datalist>` of existing folder names; persists via a new `setFolder` mutation that mirrors
  `pinEntry` + `EntryStorage.set`. `AddAccountPage.vue` advanced `<details>` gets the same.

## Ordered items

- [ ] 1. Add `folder?: string` to both `OTPEntryInterface` and `RawOTPStorage`.
      Mirror where `pinned` is declared in each interface.
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\src\definitions\otp.d.ts`
      Verify: part of item 10's compile; no standalone check.

- [ ] 2. Add a `folder` class property to `OTPEntry`, add `folder?: string` to the constructor's
      non-encrypted entry param type, assign it in the constructor with default `""` (mirror the
      `if (entry.pinned) ... else this.pinned = false` block), and set
      `this.folder = decryptedData.folder || ""` in `applyEncryption` next to the `pinned` line.
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\src\models\otp.ts`
      Verify: part of item 10's compile.

- [ ] 3. In `getOTPStorageFromEntry`, after the `if (entry.pinned) storageItem.pinned = true;`
      block, add `if (entry.folder) storageItem.folder = entry.folder;`. In `EntryStorage.get`,
      add `folder: entryData.folder` to the `new OTPEntry({...})` call (next to `pinned`). In
      `import`, add `folder` to the `entryData` object type and set
      `folder: data[hash].folder || ""`. In `backupGetExport`, do NOT add a `delete entry.folder`
      line (leave folder intact so backups round-trip).
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\src\models\storage.ts`
      Verify: items 9 and 10.

- [ ] 4. Add a storage round-trip test proving an entry with a `folder` survives
      `getOTPStorageFromEntry` -> `EntryStorage.get`. Follow the `sinon-chrome` + mocha/chai
      pattern in `src/test/components/Popup/MenuPage.test.ts` (import from `../../..`, mock
      `chrome.storage.sync.get/set`). Because `getOTPStorageFromEntry` is private, exercise it
      through the public path: `EntryStorage.set([entry])` then `EntryStorage.get()`, asserting
      the returned entry's `folder` equals the input, and that an entry with empty folder reads
      back as `""`/falsy and does not crash. The `src/test` require.context auto-discovers any
      `*.test.ts`, so no wiring is needed.
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\src\test\models\storage.test.ts` (new)
      Verify: items 9 (compile) and, if the puppeteer runner is available, item 11.

- [ ] 5. Add `collapsedFolders: string[]` to `AccountsState`.
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\src\definitions\module-interface.d.ts`
      Verify: item 10.

- [ ] 6. In the Accounts module: initialize `collapsedFolders: []` in `state`; add a `folders`
      getter returning the distinct non-empty `folder` values across `state.entries`, sorted
      with `localeCompare`; add a `setFolder(state, { entry, folder })` mutation that sets
      `state.entries[entry.index].folder = folder` (mirror `pinEntry`); add a
      `toggleFolderCollapsed(state, folderName)` mutation that adds/removes the name in
      `collapsedFolders`. Leave the existing pinned-first `entries` getter unchanged.
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\src\store\Accounts.ts`
      Verify: item 10.

- [ ] 7. In `EntryComponent.vue`, add a folder text input inside the inline-edit area (near the
      issuer/account `issuerEdit` inputs, which already show only while editing), bound to a
      `<datalist>` populated from the `accounts/folders` getter. On change call a `setFolder`
      method that commits `accounts/setFolder` then `await EntryStorage.set(...entries)` — mirror
      the existing `pin()` method exactly. Map the `folders` getter via `mapGetters`.
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\src\components\Popup\EntryComponent.vue`
      Verify: item 10; manual load-unpacked smoke if feasible.

- [ ] 8. In `AddAccountPage.vue`, add a `folder: ""` field to `newAccount`, add a folder text
      input + `<datalist>` (fed by `accounts/folders`) inside the advanced `<details>` section,
      and pass `folder: this.newAccount.folder` into the `new OTPEntry({...})` constructor call.
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\src\components\Popup\AddAccountPage.vue`
      Verify: item 10.

- [ ] 9. In `MainBody.vue`, render the accordion. Compute grouped sections from the `entries`
      getter: an "Ungrouped" section (entries with falsy `folder`) first, then one section per
      name from the `folders` getter (sorted). Each section is a collapsible header (click toggles
      `accounts/toggleFolderCollapsed`; collapsed state read from `collapsedFolders`) over its own
      list of `EntryComponent` rows filtered to that folder. When `folders` is empty, render the
      current single flat `v-dragula` list unchanged. When sections render, give each section its
      own dragula list (per-folder drake) OR, if per-section drakes are flaky, keep drag within the
      flat list only and record the limitation in FEAT findings. Preserve the existing
      `dropModel` -> `accounts/moveCode` -> `EntryStorage.set` flow for the flat case. Keep the
      `no-entry` empty state. Use the new i18n `ungrouped` string for the default group header.
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\src\components\Popup\MainBody.vue`
      Verify: item 10; manual smoke that no-folder entries appear under Ungrouped and never crash.

- [ ] 10. Add new i18n strings to the en locale: `folder` (label, e.g. "Folder"),
      `ungrouped` (default group name, e.g. "Ungrouped"), and `folder_placeholder`
      (input placeholder, e.g. "Folder name"). Append before the closing brace, matching the
      existing `{ "message": "...", "description": "..." }` shape. Other locales fall back to en.
      Files: `c:\Users\Noah\Documents\projects\Authenticator\.worktrees\folders\_locales\en\messages.json`
      Verify: item 11.

- [ ] 11. Build/type-check and lint (bash-free, Windows-friendly). Run from the worktree root:
      - `npx webpack --config ./webpack.config.js` — compiles all entries through
        `ts-loader` + `ForkTsCheckerWebpackPlugin`, which type-checks `.ts` and `.vue`. Expect a
        successful build with no TypeScript errors reported by fork-ts-checker. (This is what
        `bash scripts/build.sh chrome` runs for compilation; webpack runs via node, no bash.)
      - `npx eslint . --ext .js,.ts` — expect no errors.
      - `npx prettier --check` on each changed file — expect "All matched files use Prettier
        code style". Run `--write` if it reports formatting diffs, then re-check.
      Report the exact commands and their output. Do NOT claim success on "no errors" alone;
      paste the relevant build/lint summary lines.

- [ ] 12. Run the tests if the environment allows. The runner (`node scripts/test-runner.js`,
      invoked by `npm test` after `npm run pretest`) uses Puppeteer with a non-headless Chrome and
      a hardcoded original extension id, and `pretest` is a bash script — all brittle on Windows.
      Therefore: at minimum confirm the new `src/test/models/storage.test.ts` COMPILES as part of
      item 11's webpack build (the `src/test` require.context pulls it into the `test` bundle). If
      Puppeteer + Chrome are available, run `node scripts/test-runner.js` after a `test` webpack
      build and report pass/fail for the new storage round-trip test. If it cannot run on Windows,
      state that explicitly and rely on the compile.
      Files: n/a (verification only).
      Verify: new storage test present in compiled `test` bundle; runner output if available.

## Constraints honored
Do NOT add `archived` or any archive UI. Do NOT rebrand (name/icons/manifest/oauth). Do NOT
touch cloud-backup credentials or `scripts/credentials.ts`. Keep `chrome.storage.sync` payloads
small (folder is a short per-entry string, written only when set). Preserve the MIT `LICENSE`.

## Known gaps / assumptions
- If a user runs an OLD version of the extension on another synced profile and it re-saves an
  entry, the old `getOTPStorageFromEntry` drops `folder`. Mitigation is to update all installs;
  not fixable in this fork alone. Documented, not blocking.
- Cross-folder drag reorder may be reduced to within-folder (or disabled when grouped) if
  per-section drakes prove flaky; the flat no-folder list must keep its current drag behavior.
