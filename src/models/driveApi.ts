// Minimal Google Drive client for the app-data folder only.
// Platform-neutral: tokens come from a DriveAuth adapter supplied by the
// caller (Chrome identity on the extension, PKCE on mobile).

export const SYNC_FILE_NAME = "authenticator-folders-sync.json";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export type DriveErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH_DENIED"
  | "NETWORK"
  | "HTTP";

// Error text shown to the user must never contain a token.
export function redact(text: string): string {
  return text
    .replace(/ya29\.[\w.-]+/g, "[token]")
    .replace(/Bearer\s+\S+/gi, "Bearer [token]")
    .replace(/(?<![\w/])1\/\/[\w-]+/g, "[token]")
    .replace(/\bcode=[^&\s"'<>]+/gi, "code=[code]")
    .replace(/(?<![\w/])4\/[\w-]{10,}/g, "[code]")
    .slice(0, 300);
}
export class DriveError extends Error {
  code: DriveErrorCode;
  status?: number;
  detail?: string;
  constructor(code: DriveErrorCode, status?: number, detail?: string) {
    super(status ? `${code} ${status}` : code);
    this.code = code;
    this.status = status;
    this.detail = detail ? redact(detail) : undefined;
    Object.setPrototypeOf(this, DriveError.prototype);
  }
}

export interface DriveFile {
  id: string;
  modifiedTime?: string;
}

export interface DriveAuth {
  getToken(interactive: boolean): Promise<string>;
  dropToken(token: string): Promise<void>;
}

export function createDriveApi(auth: DriveAuth) {
  async function request(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
    interactive: boolean
  ): Promise<Response> {
    let token = await auth.getToken(interactive);
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        throw new DriveError(
          "NETWORK",
          undefined,
          e instanceof Error ? e.message : String(e)
        );
      }
      if (response.status === 401 && attempt === 0) {
        // cached token expired or was revoked: drop it and get a fresh one
        await auth.dropToken(token);
        token = await auth.getToken(interactive);
        continue;
      }
      if (!response.ok) {
        throw new DriveError(
          "HTTP",
          response.status,
          await response.text().catch(() => "")
        );
      }
      return response;
    }
    throw new DriveError("HTTP", 401);
  }

  async function findFile(interactive = true): Promise<DriveFile | null> {
    const q = encodeURIComponent(`name='${SYNC_FILE_NAME}'`);
    const response = await request(
      `${API}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`,
      {},
      interactive
    );
    const body = await response.json();
    return body.files && body.files.length > 0 ? body.files[0] : null;
  }

  async function downloadFile(id: string): Promise<string> {
    const response = await request(
      `${API}/${encodeURIComponent(id)}?alt=media`,
      {},
      true
    );
    return response.text();
  }

  async function createFile(text: string): Promise<void> {
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

  async function updateFile(id: string, text: string): Promise<void> {
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

  async function deleteFile(id: string): Promise<void> {
    await request(
      `${API}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      true
    );
  }

  return { findFile, downloadFile, createFile, updateFile, deleteFile };
}
