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
| Google sign-in | OAuth 2.0 authorization code with PKCE through the system browser, **Android** client type, custom URI scheme redirect `il.co.dinains.authenticatorfolders:/oauth2redirect` | Needs only the official `@capacitor/browser` and `@capacitor/app` plugins and is fully unit-testable. No client secret. The refresh token is kept in Keystore-backed secure storage. |
| Package name | `il.co.dinains.authenticatorfolders` | Cannot change after a Google Play release. App name: Authenticator Folders. |
| App lock | None in v1 | Secrets are encrypted with a Keystore key, backup is disabled (`allowBackup="false"`), `FLAG_SECURE` blocks screenshots and the recents thumbnail. A lock adds a plugin and a lockout-recovery path. Candidate for v2. |
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

## Google Cloud setup (needed for Drive sync)

Use the same project as the extension (`authenticator-folders`) so the app sees the same app-data file. The Drive API, the consent screen (External, In production) and the `drive.appdata` scope are already set up.

1. Get the debug SHA-1. After the first Gradle build: `cd mobile\android; .\gradlew.bat signingReport`. Or, once `~\.android\debug.keystore` exists:

   ```powershell
   keytool -list -v -alias androiddebugkey -keystore "$env:USERPROFILE\.android\debug.keystore" -storepass android -keypass android
   ```

   Copy the `SHA1:` line.
2. Google Cloud console > APIs & Services > Credentials > Create credentials > OAuth client ID > Application type **Android**. Name: `Authenticator Folders Android (debug)`. Package name `il.co.dinains.authenticatorfolders`. SHA-1 from step 1. Create.
3. Open the new client > **Advanced settings** > tick **Enable custom URI scheme**. Save.
4. Copy the client ID (`NNN-xxxx.apps.googleusercontent.com`) into `mobile/src/config.ts`, constant `GOOGLE_ANDROID_CLIENT_ID`. This is the only place. Rebuild (`npm run build; npx cap sync android`, then Gradle).
5. For a release build, create a second Android client with the release keystore's SHA-1 (and the Play App Signing SHA-1 if published on Google Play). Changes can take a few hours to apply.
6. Nothing changes on the consent screen.

Until step 4 is done, the Sync screen shows a "not configured" message and hides its buttons.

### Fallback if Google rejects the custom URI scheme redirect

This is the riskiest untested part: it cannot be tried without a phone and a real client. If the browser shows `redirect_uri` or "custom scheme" errors even with "Enable custom URI scheme" ticked, switch to the Credential Manager route: a Google sign-in plugin such as `@capgo/capacitor-social-login` (needs a Web client plus the Android client and a `MainActivity` change; check that it supports Capacitor 8). Only `mobile/src/core/driveAuth.ts` and `mobile/src/ui/auth.ts` would change; the Drive and sync code stay the same.

## Hand-test checklist (phone)

1. Install the debug APK; the app opens, the list is empty, the warranty text is visible in Sync.
2. Add an account by manual entry; the code shows, refreshes every 30 s, tapping copies it (paste elsewhere).
3. Scan a QR code from any site's 2FA setup page; the account appears. Cancel the scanner: no crash.
4. Create the nested folder `Work/Email`; folders are collapsed by default and nest. Archive an account; it moves to the Archive section.
5. Close the app from recents and reopen: accounts are still there. The recents thumbnail is blank and screenshots are blocked.
6. Sync > Upload with Google sign-in (the first time asks for consent in a browser tab and returns to the app). Then in the extension use Download with the same passphrase; the accounts match.
7. Add an account in the extension, upload from the extension, download on the phone. All three conflict choices behave as in the extension.
8. Wrong passphrase on download: "Wrong passphrase", nothing changed.
9. Time the passphrase step (19 MiB Argon2) on this phone.
10. Sign out, then sync again: consent is asked again.

## Not testable on this machine

Camera scan, the Google sign-in redirect and consent, Keystore on real hardware, `FLAG_SECURE`, and the Gradle build (no JDK/SDK). All are covered by the checklist above.

## No warranty

No warranty: this feature is provided as is. The developer never receives or stores your data. It lives only in your own Google Drive, encrypted with your passphrase. You are responsible for keeping your own backups.
