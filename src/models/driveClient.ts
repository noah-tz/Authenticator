// Minimal Google Drive client for the app-data folder only.
// The OAuth client ID is read from the manifest (oauth2.client_id); that is
// the only place it is stored. REST calls live in driveApi.ts.
import { createDriveApi, DriveAuth, DriveError, DriveFile } from "./driveApi";

export { DriveError, redact, SYNC_FILE_NAME, DRIVE_SCOPE } from "./driveApi";
export type { DriveFile, DriveErrorCode } from "./driveApi";

export function getClientId(): string | undefined {
  const manifest = chrome.runtime.getManifest() as chrome.runtime.Manifest & {
    oauth2?: { client_id?: string };
  };
  return manifest.oauth2?.client_id;
}

export function isConfigured(): boolean {
  const id = getClientId();
  return !!id && !id.startsWith("YOUR_");
}

// Runs in the background service worker so the Google consent window cannot
// close the popup and drop the answer. The token stays cached by Chrome.
export function requestAuthToken(
  interactive: boolean
): Promise<{ token?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      chrome.identity.getAuthToken({ interactive }, (result?: unknown) => {
        const error = chrome.runtime.lastError?.message;
        // Older Chrome returns a string, newer an object with a token field.
        const token =
          typeof result === "string"
            ? result
            : (result as { token?: string } | undefined)?.token;
        if (error || !token) {
          resolve({ error: error || "No token was returned." });
          return;
        }
        resolve({ token });
      });
    } catch (e) {
      resolve({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
function getToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "getAuthToken", interactive },
      (response?: { token?: string; error?: string }) => {
        const error = chrome.runtime.lastError?.message;
        if (error || !response || !response.token) {
          reject(
            new DriveError(
              "AUTH_DENIED",
              undefined,
              error || response?.error || "No response from background."
            )
          );
          return;
        }
        resolve(response.token);
      }
    );
  });
}
function removeToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

const chromeAuth: DriveAuth = {
  getToken(interactive: boolean): Promise<string> {
    if (!isConfigured()) {
      return Promise.reject(new DriveError("NOT_CONFIGURED"));
    }
    return getToken(interactive);
  },
  dropToken: removeToken,
};

const api = createDriveApi(chromeAuth);

export const findFile: (interactive?: boolean) => Promise<DriveFile | null> =
  api.findFile;
export const downloadFile = api.downloadFile;
export const createFile = api.createFile;
export const updateFile = api.updateFile;
export const deleteFile = api.deleteFile;
