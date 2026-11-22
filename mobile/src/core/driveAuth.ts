import {
  DriveAuth,
  DriveError,
  redact,
} from "../../../src/models/driveApi";

// Google gives no expiry for the access token; it lives about an hour.
export const TOKEN_LIFETIME_MS = 50 * 60 * 1000;

export interface NativeAuthorization {
  // Resolves with an access token; rejects with { code } on failure.
  // Non-interactive calls reject with code CONSENT_REQUIRED when the user
  // has to approve something first.
  authorize(opts: { interactive: boolean }): Promise<{ accessToken: string }>;
  // Tells Google Play services to forget a token that Drive rejected.
  clearToken(opts: { accessToken: string }): Promise<void>;
  // Revokes the app's Drive access.
  signOut(): Promise<void>;
}

export interface DriveAuthDeps {
  native: NativeAuthorization;
  now?: () => number;
}

export interface DriveAuthHandle extends DriveAuth {
  signOut(): Promise<void>;
}

function errorCode(e: unknown): string {
  return e && typeof (e as { code?: unknown }).code === "string"
    ? ((e as { code: string }).code as string)
    : "";
}

function errorText(e: unknown): string {
  return redact(e instanceof Error ? e.message : String(e));
}

export function createDriveAuth(deps: DriveAuthDeps): DriveAuthHandle {
  const now = deps.now || (() => Date.now());
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  async function call(interactive: boolean): Promise<string> {
    let result: { accessToken: string };
    try {
      result = await deps.native.authorize({ interactive });
    } catch (e) {
      const code = errorCode(e);
      if (code === "CONSENT_REQUIRED" || code === "AUTH_DENIED") {
        throw new DriveError("AUTH_DENIED");
      }
      throw new DriveError("HTTP", undefined, errorText(e));
    }
    if (!result || !result.accessToken) {
      throw new DriveError("HTTP", undefined, "no access token in response");
    }
    cached = {
      token: result.accessToken,
      expiresAt: now() + TOKEN_LIFETIME_MS,
    };
    return result.accessToken;
  }

  async function obtain(interactive: boolean): Promise<string> {
    if (cached && cached.expiresAt > now()) {
      return cached.token;
    }
    cached = null;
    try {
      // no refresh token exists: ask Google Play services quietly first
      return await call(false);
    } catch (e) {
      if (!interactive || !(e instanceof DriveError) || e.code !== "AUTH_DENIED") {
        throw e;
      }
    }
    return call(true);
  }

  // Concurrent callers share one in-flight request, whatever their
  // interactive flag; fine while the UI runs a single auth flow at a time.
  function getToken(interactive: boolean): Promise<string> {
    if (!pending) {
      pending = obtain(interactive).finally(() => {
        pending = null;
      });
    }
    return pending;
  }

  async function dropToken(token: string): Promise<void> {
    if (cached && cached.token === token) {
      cached = null;
    }
    try {
      await deps.native.clearToken({ accessToken: token });
    } catch (e) {
      // best effort; the next authorize may still hand out a fresh token
    }
  }

  async function signOut(): Promise<void> {
    cached = null;
    try {
      await deps.native.signOut();
    } catch (e) {
      // already signed out locally; revoking is best effort
    }
  }

  return { getToken, dropToken, signOut };
}
