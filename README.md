# Authenticator Folders

> Two-factor authentication (2FA) codes in your browser, organized into nested folders with an archive.

Authenticator Folders is a fork of the open-source [Authenticator](https://github.com/Authenticator-Extension/Authenticator) extension (MIT licensed), with these additions:

- **Nested folders** ג€” organize accounts into folders and sub-folders using a `/` separator (e.g. `Work/Clients`). Each folder is a collapsible accordion section.
- **Folder picker** ג€” an in-field dropdown with live autocomplete of existing folder paths.
- **Expand / collapse all** ג€” a header button to open or close every folder at once.
- **Archive** ג€” right-click an account to move it to a bottom-anchored, always-present Archive section (and restore it later). Codes keep generating while archived.

Accounts continue to sync across your Chrome profiles via Chrome's built-in `chrome.storage.sync` (Google-account sync). The cloud-backup integrations (Google Drive / Dropbox / OneDrive) from upstream have been removed; manual file export/import and QR import remain.

Optional, user-initiated, end-to-end encrypted sync through the Drive app-data folder is available in Chrome (the Sync menu item). The file format is in [docs/sync-format.md](docs/sync-format.md); owner setup is in [docs/drive-sync-setup.md](docs/drive-sync-setup.md).

## Build

```bash
npm install
npm run chrome   # requires bash (Git Bash on Windows)
```

The built, loadable extension is written to the `chrome/` directory. Load it via `chrome://extensions` ג†’ Developer mode ג†’ **Load unpacked** ג†’ select the `chrome/` folder.

> Windows users need [Git Bash](https://git-scm.com/download/win) to run the build scripts, or build the webpack/sass steps directly with Node.

## Mobile app (Android)

The `mobile/` folder holds an Android app (Capacitor) that shows the same folders and syncs through the same encrypted Drive file as the extension. Install, build, Google Cloud setup and the hand-test checklist are in [docs/mobile-setup.md](docs/mobile-setup.md).

The app is the extension popup: it is built from the same `src/` files (Vue components, Vuex store, `sass/popup.scss`, background handlers) with Vite. Desktop-only options (popup mode, context-menu and autofill settings, scale, permissions page) are hidden on mobile through the `src/platform.ts` seam.

- Dev mode: `cd mobile; npm install; npm run dev` and open http://localhost:5173 (secrets are stored unencrypted in the browser, use test accounts only). Checks: `npm run typecheck`, `npm test`, `npm run build`.
- The `chrome.*` shim: `mobile/src/chrome/` implements only the APIs the shared code uses (storage, runtime messaging, alarms, i18n, identity, permissions) on top of Keystore-backed storage, and is never bundled into the extension. Argon2 runs in a hash-wasm iframe (`mobile/argon.html`). Long-press replaces right-click, and the camera scan feeds the extension's own `getTotp` handler.
- In the app, the rating banner asks for a GitHub star and its Rate button opens https://github.com/noah-tz/Authenticator. The extension still opens its Chrome Web Store reviews page.
- Not testable without a device: camera scanning, native Google sign-in, Keystore on real hardware, and the share sheet used for backup export.

## Install on Android

The app is not on Google Play. It is published for free as an APK on [GitHub Releases](https://github.com/noah-tz/Authenticator/releases).

1. On the phone, open the latest release and download `AuthenticatorFolders-<version>.apk`.
2. Open the downloaded file. Android asks you to allow installs from this source (your browser or file manager): allow it, then tap Install.
3. Optional, for automatic updates: install [Obtainium](https://github.com/ImranR98/Obtainium), tap Add App and enter `https://github.com/noah-tz/Authenticator`. Obtainium checks GitHub Releases and offers each new APK.

Updates install over the existing app only when they come from these same signed builds. An APK built or signed by anyone else will not install over it; Android would make you uninstall first, which deletes the accounts stored on the phone. Keep a backup (export or Drive sync) before switching builds.

## License

MIT. See [LICENSE](LICENSE). This project retains the original copyright notice as required by the MIT license of the upstream Authenticator project.
