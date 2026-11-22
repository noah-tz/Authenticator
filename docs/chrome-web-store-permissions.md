# Chrome Web Store: permission justifications (paste-ready)

Single purpose: generate and organize two-factor authentication codes. The optional Drive sync is a backup and transfer feature for those same accounts and stays within that purpose.

## identity (optional permission)

Requested only when the user clicks "Upload to Drive" or "Download from Drive" in the Sync page. Used to obtain a Google OAuth token with chrome.identity so the extension can read and write one file in the extension's own hidden app-data folder of the user's Google Drive (scope drive.appdata). The extension cannot see any other Drive file. The token is used only on the user's device. Nothing is sent to the developer.

## Google Drive scope (drive.appdata)

Used to store one encrypted file, authenticator-folders-sync.json, in the app-data folder of the user's own Drive. The data is encrypted on the device with a passphrase only the user knows before upload. The developer runs no server and never receives or stores user data.

## Host permission: https://www.googleapis.com/ (connect-src)

Not a host permission. The extension page policy allows connections to https://www.googleapis.com/ so the Drive API can be called with the user's token.

## Existing permissions

- storage: save accounts and their folder/archive organization, and sync them across the user's own Chrome profiles.
- activeTab and scripting: read the current tab's domain to suggest matching codes, and autofill a code into the active page only when the user chooses.
- alarms: run the auto-lock timer.
- clipboardWrite (optional): copy a code when the user clicks it.
- contextMenus (optional): right-click actions to scan a QR code and move an account to the archive.
- https://www.google.com/ (optional host): read the HTTP Date header to correct clock drift, only when the user clicks "Sync clock".

## Remote code

None. All code ships in the package. The argon2 key derivation runs in a packaged sandbox page.

## Data use disclosures

- Authentication information and personal data (2FA secrets, account names) are handled. They are stored on the device and, if the user chooses Drive sync, uploaded only in encrypted form to the user's own Drive.
- Not sold or transferred to third parties, not used for unrelated purposes, not used for creditworthiness or lending.
- Privacy policy: the public URL of PRIVACY.md.
