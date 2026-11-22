# Authenticator Folders for Android: setup, build and test

## What the app is

An Android app (Capacitor 8 + plain TypeScript, in `mobile/`) that shows TOTP/HOTP codes in folders and syncs with the browser extension through the same encrypted file in your own Google Drive (`drive.appdata`, format in [sync-format.md](sync-format.md)). It shares the extension's TypeScript for OTP generation, folders, the sync crypto and the three-way conflict choices (`src/models/`).

### v1 scope limits

- Android only (no iOS project).
- No `otpauth-migration://` import, no time-offset setting, no widget.
- No app lock (PIN or biometrics). The phone's screen lock protects the device.
- English only.
- The sync passphrase is never stored; it is typed for every sync.

## Decisions and reasons

| Topic | Decision | Reason |
|---|---|---|
| UI | Plain TypeScript with a small DOM helper, no Vue | The extension's Vue components depend on Vuex and `chrome.*`. Vue 2 is end of life. About six screens do not need a framework. Text is set with `textContent` only, because names come from scanned QR codes. |
| Bundler and tests | Vite and Vitest in `mobile/` | Own `package.json`; shared files in `../src/models` are compiled by Vite. |
| Argon2 | `hash-wasm` (Argon2id) | `argon2-browser` needs wasm loader overrides that do not fit Vite. Argon2id v1.3 is a fixed standard. A test decrypts a file written by the extension's own code. |
| Google sign-in | Google Identity Services for Android: `AuthorizationClient` from `com.google.android.gms:play-services-auth`, wrapped in a small local Capacitor plugin (`GoogleAuthorizationPlugin.java`) | Google no longer lets new Android OAuth clients use a custom URI scheme redirect ([blog, Oct 2023](https://developers.googleblog.com/en/improving-user-safety-in-oauth-flows-through-new-oauth-custom-uri-scheme-restrictions/)) and recommends this SDK. It returns an access token directly and identifies the app by package name and signing SHA-1, so the code holds no client ID, redirect or secret. There is no refresh token: on a missing or rejected (401) token the app asks again silently, then with the consent screen. |
| Package name | `il.co.dinains.authenticatorfolders` | Cannot change after a Google Play release. App name: Authenticator Folders. |
| App lock | None in v1 | Secrets are encrypted with a Keystore key, backup is disabled (`allowBackup="false"`). Screenshots and the recents thumbnail are allowed by the owner's choice (no `FLAG_SECURE`), so the codes and account names are visible in them. A lock adds a plugin and a lockout-recovery path. Candidate for v2. |
| QR scan | `@capacitor-mlkit/barcode-scanning` `scan()` (Google code scanner) | Per the plugin README, `scan()` needs no camera permission, so neither `CAMERA` nor the `barcode_ui` meta-data is added. It needs the Google Barcode Scanner module from Google Play services, which the app installs on first use. Devices without Google Play services cannot scan; manual entry still works. |

## Build environment on this machine (checked when the platform was added)

- Node v22.14.0, npm 10.9.2.
- Java: only a **JRE** 21.0.12 (Temurin). `JAVA_HOME` points at the JRE (`C:\Program Files\Eclipse Adoptium\jre-21.0.12.8-hotspot\`). There is no `javac`.
- No Android SDK (`ANDROID_HOME` empty, no `%LOCALAPPDATA%\Android\Sdk`), no Gradle, no adb, no debug keystore.
- Result: **APK not built: no JDK/SDK.** The Android project was generated with `npx cap add android` and checked with `tsc`, `vite build`, `vitest` and `npx cap sync android`. Gradle was never run.

## Install and build

1. Install **Android Studio** (it bundles JDK 21 and the SDK manager), or Temurin **JDK 21** plus the Android command-line tools. Install Android SDK Platform 36 (or what `mobile/android/variables.gradle` names as `compileSdkVersion`) and build-tools through the SDK manager.
2. Set `JAVA_HOME` to the **JDK** folder (not the JRE currently set) and `ANDROID_HOME` to the SDK folder (usually `%LOCALAPPDATA%\Android\Sdk`).
3. Build:

   ```powershell
   cd mobile
   npm install
   npm run build
   npx cap sync android
   cd android
   .\gradlew.bat assembleDebug
   ```

   The APK is `mobile\android\app\build\outputs\apk\debug\app-debug.apk`.
4. Install on the phone, either:
   - Enable Developer options and USB debugging, connect the phone, then `adb install -r app-debug.apk`; or
   - copy the APK to the phone and open it, allowing installs from that source.

## Release build (GitHub Releases)
The app is distributed as a signed APK on GitHub Releases (users can follow it with Obtainium). Every release must be signed with the same key, or Android refuses to install it over an existing install.

### Signing key
- Keystore: `%USERPROFILE%\AuthenticatorFolders-signing\release.jks` (PKCS12, RSA 4096, alias `authenticator-folders`, DN `CN=Authenticator Folders, O=noah-tz`), outside the repo.
- Password, alias and fingerprints: `%USERPROFILE%\AuthenticatorFolders-signing\README-BACKUP.txt`.
- Release certificate SHA-1: `DC:9A:BC:6C:E0:70:97:65:FB:71:12:36:DE:10:D0:07:4D:3C:72:57`
- Release certificate SHA-256: `CB:C5:76:AF:59:B5:E0:BF:47:2A:6F:BB:76:C5:B5:A1:51:45:D4:56:C3:A0:35:75:92:A3:A7:9F:6A:4B:8E:AF`

**Back up `release.jks` and `README-BACKUP.txt` (for example in a password manager).** If the keystore or its password is lost, no future update can be installed over existing installs. Users would have to uninstall, which deletes the accounts stored on the phone.

Gradle reads the signing settings from `mobile\android\keystore.properties`, which is git-ignored (as are `*.jks` and `*.keystore`). Create it on a new machine:
```properties
storeFile=C:/Users/<you>/AuthenticatorFolders-signing/release.jks
storePassword=<password from README-BACKUP.txt>
keyAlias=authenticator-folders
keyPassword=<password from README-BACKUP.txt>
```
Without this file `assembleRelease` still runs but writes an unsigned `app-release-unsigned.apk` (with a warning). Debug builds do not use it.

The release build type sets `debuggable false`. Capacitor turns WebView debugging on only for debuggable builds, so it is off in release. Minification stays off (`minifyEnabled false`, the Capacitor default).

### Version numbers
Both live in `mobile\android\app\build.gradle` under `defaultConfig`:
- `versionCode`: an integer that must grow by at least 1 for every release, or Android and Obtainium will not offer the update.
- `versionName`: the version shown to users, for example `1.0.1`. Use the same number in the GitHub release tag and the APK name.

### Steps
```powershell
cd mobile
npm run typecheck
npm test
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleRelease
& "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat" verify --print-certs app\build\outputs\apk\release\app-release.apk
```
The SHA-1 printed by apksigner must match the release SHA-1 above. Rename `app\build\outputs\apk\release\app-release.apk` to `AuthenticatorFolders-<versionName>.apk` and attach it to the GitHub release, with notes in `docs/release-notes/`.

## Google Cloud setup (needed for Drive sync)
Use the same project as the extension (`authenticator-folders`) so the app sees the same app-data file. The Drive API, the consent screen (External, In production) and the `drive.appdata` scope are already set up.
The only extra setup is an **Android** OAuth client with the package name and the signing SHA-1. Its client ID is **not** copied into the code: Google matches the app by package name and SHA-1.
1. Debug build (done): client of type Android, package `il.co.dinains.authenticatorfolders`, debug SHA-1 `50:8D:CE:24:B8:07:DA:A0:76:1E:9E:94:CD:C6:F1:7B:93:86:95:70`. Get a SHA-1 yourself with `cd mobile\android; .\gradlew.bat signingReport`.
2. **Release build**: create another Android client (Credentials > Create credentials > OAuth client ID > Android) with the same package name and the SHA-1 of the release keystore (`DC:9A:BC:6C:E0:70:97:65:FB:71:12:36:DE:10:D0:07:4D:3C:72:57`, see Release build above). If the app is published on Google Play with Play App Signing, also add the SHA-1 of the app signing key shown in Play Console > App integrity. Without it, sign-in fails on release builds.
3. Changes can take a few hours to apply. Nothing changes on the consent screen.
There is no "Enable custom URI scheme" option on Android clients and none is needed.
### How sign-in works
- Sync > Upload or Download calls the plugin's `authorize`. If Google already has consent, it returns an access token silently. Otherwise the app calls it again with `interactive: true` and Google shows its consent screen.
- Access tokens are cached in memory for 50 minutes. When Drive answers 401, the app drops the token (`clearToken`) and authorizes again, silently first, then with the consent screen.
- Sign out calls `revokeAccess`, which removes the app's Drive access, so the next sync asks for consent again. Nothing is stored on the phone for sign-in.
- Code: `mobile/src/core/driveAuth.ts`, `mobile/src/ui/auth.ts`, `mobile/android/app/src/main/java/il/co/dinains/authenticatorfolders/GoogleAuthorizationPlugin.java`.

## Run in the browser

Start the Vite dev server from the `mobile` folder with the `dev` npm script (`npm run` followed by `dev`), then open http://localhost:5173 in Chrome. The port is fixed (`strictPort`): if it is taken the server stops instead of picking another, because the Google OAuth origin must match. Edits hot-reload. Startup and unhandled errors are also written to the DevTools console with full stacks.

**Warning:** in the browser, secrets are stored unencrypted in `localStorage` (keys prefixed `insecure-dev:`). A banner says so. Use test accounts only. This data is separate from the phone's.

Works on web: list, folders, manual add, pasting an `otpauth://` URI, webcam QR scan (needs camera permission), edit, move, archive, remove, copy code (browser clipboard), and Google Drive sync through Google Identity Services (web OAuth client in project `authenticator-folders`, scope `drive.appdata`, so it sees the same sync file as the extension and the phone). Sign-in opens a Google popup; allow popups for localhost.

Native-only (not available in the browser): Android Keystore storage, the MLKit scanner, the native Google authorization plugin. The Android build is unchanged and keeps its strict Content-Security-Policy; only the dev server relaxes it.

## Hand-test checklist (phone)

1. Install the debug APK; the app opens, the list is empty, the warranty text is visible in Sync.
2. Add an account by manual entry; the code shows, refreshes every 30 s, tapping copies it (paste elsewhere).
3. Scan a QR code from any site's 2FA setup page; the account appears. Cancel the scanner: no crash.
4. Create the nested folder `Work/Email`; folders are collapsed by default and nest. Archive an account; it moves to the Archive section.
5. Close the app from recents and reopen: accounts are still there. Screenshots work, and the recents thumbnail shows the app.
6. Sync > Upload with Google sign-in (the first time Google shows its consent screen over the app). Then in the extension use Download with the same passphrase; the accounts match.
7. Add an account in the extension, upload from the extension, download on the phone. All three conflict choices behave as in the extension.
8. Wrong passphrase on download: "Wrong passphrase", nothing changed.
9. Time the passphrase step (19 MiB Argon2) on this phone.
10. Sign out, then sync again: consent is asked again.

## Not testable on this machine

Camera scan, the Google sign-in and consent, Keystore on real hardware, and the Gradle build (no JDK/SDK). All are covered by the checklist above.

## No warranty

No warranty: this feature is provided as is. The developer never receives or stores your data. It lives only in your own Google Drive, encrypted with your passphrase. You are responsible for keeping your own backups.
