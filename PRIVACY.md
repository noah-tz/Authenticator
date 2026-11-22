# Privacy Policy — Authenticator Folders

_Last updated: 2026 (added optional Google Drive sync)_

Authenticator Folders ("the extension") is a browser extension that generates two-factor authentication (2FA) codes and lets you organize your accounts into folders and an archive.

## What data the extension handles

The extension stores the 2FA accounts you add (issuer, account name, secret, and the folder/archive organization you assign). This data is:

- **Stored locally in your browser**, and
- **Synced across your own Chrome profiles** using Chrome's built-in `chrome.storage.sync` (your Google account sync), when enabled.

## What we do NOT do

- We do **not** send your accounts, secrets, 2FA codes, or any other personal data to any server operated by us. We run no server. The only optional exception is the Google Drive sync you start yourself, described below, which writes encrypted data to your own Google Drive.
- We do **not** sell or transfer your data to third parties.
- We do **not** use your data for any purpose unrelated to the extension's single purpose (generating and organizing 2FA codes).
- We do **not** use your data for creditworthiness or lending purposes.
- We do **not** track your browsing activity.

## Permissions

- **storage** — save your accounts and their folder/archive organization, and sync them across your own Chrome profiles.
- **activeTab / scripting** — read the current tab's domain to suggest matching codes, and autofill a code into the active page only when you choose to.
- **alarms** — run the auto-lock timer.
- **clipboardWrite** — copy a code to the clipboard when you click it.
- **identity** (optional, asked only when you first use Drive sync) - sign in with your Google account to get permission to read and write the extension's own hidden app-data folder in your Drive. The extension cannot see any other file in your Drive.
- **contextMenus** — provide right-click actions (scan a QR code, move an account to the archive).

## Google Drive sync (optional)
Drive sync is off by default. It runs only when you click "Upload to Drive" or "Download from Drive" in the Sync page.
- Your accounts are encrypted **on your device** with a sync passphrase that only you know, before anything is uploaded. Drive holds only ciphertext.
- The file is stored in the hidden app-data folder of **your own** Google Drive (scope `drive.appdata`). The extension has no access to your other Drive files.
- The developer never receives or stores your data, your passphrase or your Google token. There is no developer server.
- If you forget the sync passphrase, the data on Drive cannot be recovered by anyone, including the developer.
- This feature is provided without warranty. You are responsible for keeping your own backups.
- You can delete the Drive copy from the Sync page, and you can revoke access at https://myaccount.google.com/permissions.
- Use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.

Apart from the optional Drive sync above, all processing happens locally in your browser.

## Contact

Questions or issues: https://github.com/noah-tz/Authenticator/issues
