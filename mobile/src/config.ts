// The Google OAuth client ID (type: Android) lives ONLY here.
// See docs/ for how to create it; the package name and SHA-1 must match.
export const GOOGLE_ANDROID_CLIENT_ID =
  "YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com";
export const APP_PACKAGE = "il.co.dinains.authenticatorfolders";
export const REDIRECT_URI = `${APP_PACKAGE}:/oauth2redirect`;

// Same rule as driveClient.isConfigured in the extension.
export function isConfigured(): boolean {
  return !GOOGLE_ANDROID_CLIENT_ID.startsWith("YOUR_");
}

