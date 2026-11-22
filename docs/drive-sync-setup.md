# Drive sync: owner setup

The code is finished but cannot talk to Google until you create an OAuth client and paste its ID into the manifest. The ID is stored in one place: `manifests/manifest-chrome.json`, key `oauth2.client_id` (currently `YOUR_CLIENT_ID.apps.googleusercontent.com`). While it starts with `YOUR_`, the Sync page shows "not set up".

## Steps

1. Open https://console.cloud.google.com and create a project (for example "Authenticator Folders").
2. APIs & Services > Library > search "Google Drive API" > Enable.
3. APIs & Services > OAuth consent screen (Google Auth Platform > Branding / Audience / Data Access in the newer console):
   - User type: External.
   - App name, support email, developer contact email.
   - App home page and privacy policy link: the public URL of `PRIVACY.md` (for example on GitHub).
   - Data Access / Scopes: add `https://www.googleapis.com/auth/drive.appdata`.
4. APIs & Services > Credentials > Create credentials > OAuth client ID:
   - Application type: **Chrome extension**.
   - Item ID: `jkfgpemjlahodaicadgfkeehlglbieei`.
5. Copy the client ID and paste it into `manifests/manifest-chrome.json` as `oauth2.client_id`.
6. Rebuild: `node ./node_modules/webpack-cli/bin/cli.js`, then package as before. Do not change the manifest version unless you are releasing.
7. Local testing with an unpacked build only works if the extension ID matches the one the client is bound to. Add the store item's public key as a `key` field in the manifest used for the test build (Developer Dashboard > the item > Package > View public key). Do not keep the `key` field in the store upload.
8. While the consent screen is in "Testing", only the test users you list can sign in, and their tokens expire after 7 days. Set the publishing status to **In production** before release.

## Does it need Google's verification?

`drive.appdata` is listed by Google as a non-sensitive scope, so it should not need the sensitive-scope review. Google may still ask for brand verification of the app name, logo, home page and privacy policy link. I could not check this in your console. Confirm it under Data Access: the scope should be listed under "Non-sensitive scopes". If it is listed as sensitive, the verification review applies.

## Hand-test checklist

Nothing below was run by the developer of this change, because it needs your OAuth client.

1. Menu > Sync > Upload to Drive on a fresh account. Asks for the passphrase twice, Google consent appears, file created.
2. In a second Chrome profile with the same extension and different accounts: Download. A conflict screen appears and nothing changes until you choose.
3. Wrong passphrase on download: "Wrong passphrase" and nothing changed.
4. Each of the three choices, once for upload and once for download. Check folders, nested folders and archived accounts afterwards.
5. A matched account with a different folder or name shows under "Differ between the two", not as new.
6. "Erase Drive copy" removes the file (check at https://drive.google.com/drive/u/0/settings > Manage apps > the app > options).
7. Permissions page (permissions.html): `identity` is listed and revocable. After revoking, Sync asks again.
8. The permission prompt does not close the popup.
9. Time the key derivation (19 MiB Argon2) on your slowest machine.
10. Admin policy `disableExport` hides the Sync menu item.

## Revoking access

Users can revoke at https://myaccount.google.com/permissions. The extension's data in Drive can be deleted from the Sync page or from Drive's "Manage apps".
