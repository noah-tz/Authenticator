# Privacy Policy — Authenticator Folders

_Last updated: 2026_

Authenticator Folders ("the extension") is a browser extension that generates two-factor authentication (2FA) codes and lets you organize your accounts into folders and an archive.

## What data the extension handles

The extension stores the 2FA accounts you add (issuer, account name, secret, and the folder/archive organization you assign). This data is:

- **Stored locally in your browser**, and
- **Synced across your own Chrome profiles** using Chrome's built-in `chrome.storage.sync` (your Google account sync), when enabled.

## What we do NOT do

- We do **not** send your accounts, secrets, 2FA codes, or any other personal data to any server operated by us or by any third party.
- We do **not** sell or transfer your data to third parties.
- We do **not** use your data for any purpose unrelated to the extension's single purpose (generating and organizing 2FA codes).
- We do **not** use your data for creditworthiness or lending purposes.
- We do **not** track your browsing activity.

## Permissions

- **storage** — save your accounts and their folder/archive organization, and sync them across your own Chrome profiles.
- **activeTab / scripting** — read the current tab's domain to suggest matching codes, and autofill a code into the active page only when you choose to.
- **alarms** — run the auto-lock timer.
- **clipboardWrite** — copy a code to the clipboard when you click it.
- **contextMenus** — provide right-click actions (scan a QR code, move an account to the archive).

All processing happens locally in your browser.

## Contact

Questions or issues: https://github.com/noah-tz/Authenticator/issues
