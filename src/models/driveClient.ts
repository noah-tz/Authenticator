// Minimal Google Drive client for the app-data folder only.
// The OAuth client ID is read from the manifest (oauth2.client_id); that is
// the only place it is stored.

export const SYNC_FILE_NAME = "authenticator-folders-sync.json";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export type DriveErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH_DENIED"
  | "NETWORK"
  | "HTTP";

export class DriveError extends Error {
  code: DriveErrorCode;
  status?: number;
  constructor(code: DriveErrorCode, status?: number) {
    super(status ? `${code} ${status}` : code);
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, DriveError.prototype);
  }
}

export interface DriveFile {
  id: string;
  modifiedTime?: string;
}

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

function getToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      { interactive, scopes: [DRIVE_SCOPE] },
      (token?: string) => {
        if (chrome.runtime.lastError || !token) {
          reject(new DriveError("AUTH_DENIED"));
          return;
        }
        resolve(token);
      }
    );
  });
}

function removeToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function request(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  interactive: boolean
): Promise<Response> {
  if (!isConfigured()) {
    throw new DriveError("NOT_CONFIGURED");
  }
  let token = await getToken(interactive);
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      throw new DriveError("NETWORK");
    }
    if (response.status === 401 && attempt === 0) {
      // cached token expired or was revoked: drop it and get a fresh one
      await removeToken(token);
      token = await getToken(interactive);
      continue;
    }
    if (!response.ok) {
      throw new DriveError("HTTP", response.status);
    }
    return response;
  }
  throw new DriveError("HTTP", 401);
}

export async function findFile(interactive = true): Promise<DriveFile | null> {
  const q = encodeURIComponent(`name='${SYNC_FILE_NAME}'`);
  const response = await request(
    `${API}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`,
    {},
    interactive
  );
  const body = await response.json();
  return body.files && body.files.length > 0 ? body.files[0] : null;
}

export async function downloadFile(id: string): Promise<string> {
  const response = await request(
    `${API}/${encodeURIComponent(id)}?alt=media`,
    {},
    true
  );
  return response.text();
}

export async function createFile(text: string): Promise<void> {
  const boundary = "sync" + crypto.randomUUID();
  const metadata = JSON.stringify({
    name: SYNC_FILE_NAME,
    parents: ["appDataFolder"],
    mimeType: "application/json",
  });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${text}\r\n--${boundary}--`;
  await request(
    `${UPLOAD}?uploadType=multipart`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
    true
  );
}

export async function updateFile(id: string, text: string): Promise<void> {
  await request(
    `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: text,
    },
    true
  );
}

export async function deleteFile(id: string): Promise<void> {
  await request(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
}
