# Authenticator Folders

> Two-factor authentication (2FA) codes in your browser, organized into nested folders with an archive.

Authenticator Folders is a fork of the open-source [Authenticator](https://github.com/Authenticator-Extension/Authenticator) extension (MIT licensed), with these additions:

- **Nested folders** — organize accounts into folders and sub-folders using a `/` separator (e.g. `Work/Clients`). Each folder is a collapsible accordion section.
- **Folder picker** — an in-field dropdown with live autocomplete of existing folder paths.
- **Expand / collapse all** — a header button to open or close every folder at once.
- **Archive** — right-click an account to move it to a bottom-anchored, always-present Archive section (and restore it later). Codes keep generating while archived.

Accounts continue to sync across your Chrome profiles via Chrome's built-in `chrome.storage.sync` (Google-account sync). The cloud-backup integrations (Google Drive / Dropbox / OneDrive) from upstream have been removed; manual file export/import and QR import remain.

## Build

```bash
npm install
npm run chrome   # requires bash (Git Bash on Windows)
```

The built, loadable extension is written to the `chrome/` directory. Load it via `chrome://extensions` → Developer mode → **Load unpacked** → select the `chrome/` folder.

> Windows users need [Git Bash](https://git-scm.com/download/win) to run the build scripts, or build the webpack/sass steps directly with Node.

## License

MIT. See [LICENSE](LICENSE). This project retains the original copyright notice as required by the MIT license of the upstream Authenticator project.
