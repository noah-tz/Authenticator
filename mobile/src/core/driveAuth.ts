import {
  DriveAuth,
  DriveError,
  DRIVE_SCOPE,
  redact,
} from "../../../src/models/driveApi";
import { GOOGLE_ANDROID_CLIENT_ID, REDIRECT_URI } from "../config";
import { KeyValueStore } from "./kvstore";
import { codeChallenge, createCodeVerifier, createState } from "./pkce";

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const TOKEN_KEY = "drive.refreshToken";

export interface DriveAuthDeps {
  store: KeyValueStore;
  // Opens the system browser (Chrome Custom Tab) at the given URL.
  openBrowser(url: string): Promise<void>;
  // Resolves with the full redirect URL once the app is reopened by it.
  waitForRedirect(): Promise<string>;
  fetch: typeof fetch;
  clientId?: string;
  redirectUri?: string;
  now?: () => number;
}

export interface DriveAuthHandle extends DriveAuth {
  signOut(): Promise<void>;
  isSignedIn(): Promise<boolean>;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

export function createDriveAuth(deps: DriveAuthDeps): DriveAuthHandle {
  const clientId = deps.clientId || GOOGLE_ANDROID_CLIENT_ID;
  const redirectUri = deps.redirectUri || REDIRECT_URI;
  const now = deps.now || (() => Date.now());
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  async function postForm(
    url: string,
    form: Record<string, string>
  ): Promise<{ status: number; body: TokenResponse; text: string }> {
    let response: Response;
    try {
      response = await deps.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      });
    } catch (e) {
      throw new DriveError(
        "NETWORK",
        undefined,
        e instanceof Error ? e.message : String(e)
      );
    }
    const text = await response.text().catch(() => "");
    let body: TokenResponse = {};
    try {
      body = JSON.parse(text);
    } catch (e) {
      body = {};
    }
    return { status: response.status, body, text };
  }

  function remember(body: TokenResponse): string {
    if (!body.access_token) {
      throw new DriveError("HTTP", undefined, "no access token in response");
    }
    const lifetime = typeof body.expires_in === "number" ? body.expires_in : 3600;
    cached = {
      token: body.access_token,
      expiresAt: now() + lifetime * 1000,
    };
    return body.access_token;
  }

  async function clearTokens(): Promise<void> {
    cached = null;
    await deps.store.remove(TOKEN_KEY);
  }

  async function authorize(): Promise<string> {
    if (clientId.startsWith("YOUR_")) {
      throw new DriveError("NOT_CONFIGURED");
    }
    const verifier = createCodeVerifier();
    const state = createState();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: DRIVE_SCOPE,
      code_challenge: await codeChallenge(verifier),
      code_challenge_method: "S256",
      state,
      access_type: "offline",
      prompt: "consent",
    });
    // listen before the browser opens so the redirect cannot be missed
    const redirect = deps.waitForRedirect();
    redirect.catch(() => undefined);
    await deps.openBrowser(`${AUTH_URL}?${params.toString()}`);
    let redirectUrl: string;
    try {
      redirectUrl = await redirect;
    } catch (e) {
      throw new DriveError("AUTH_DENIED");
    }
    const query = redirectUrl.includes("?")
      ? redirectUrl.slice(redirectUrl.indexOf("?") + 1).split("#")[0]
      : "";
    const result = new URLSearchParams(query);
    if (result.get("error") || !result.get("code")) {
      throw new DriveError("AUTH_DENIED");
    }
    if (result.get("state") !== state) {
      throw new DriveError("AUTH_DENIED", undefined, "state mismatch");
    }
    const res = await postForm(TOKEN_URL, {
      client_id: clientId,
      code: result.get("code") as string,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new DriveError("HTTP", res.status, res.text);
    }
    if (res.body.refresh_token) {
      await deps.store.set(TOKEN_KEY, res.body.refresh_token);
    }
    return remember(res.body);
  }

  async function refresh(refreshToken: string): Promise<string | null> {
    const res = await postForm(TOKEN_URL, {
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    if (res.status >= 200 && res.status < 300) {
      return remember(res.body);
    }
    if (res.body.error === "invalid_grant") {
      await clearTokens();
      return null;
    }
    throw new DriveError("HTTP", res.status, redact(res.text));
  }

  async function obtain(interactive: boolean): Promise<string> {
    if (cached && cached.expiresAt - 60000 > now()) {
      return cached.token;
    }
    cached = null;
    const refreshToken = await deps.store.get(TOKEN_KEY);
    if (refreshToken) {
      const token = await refresh(refreshToken);
      if (token) {
        return token;
      }
    }
    if (!interactive) {
      throw new DriveError("AUTH_DENIED");
    }
    return authorize();
  }

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
  }

  async function signOut(): Promise<void> {
    const refreshToken = await deps.store.get(TOKEN_KEY);
    const token = refreshToken || (cached && cached.token);
    await clearTokens();
    if (token) {
      try {
        await postForm(REVOKE_URL, { token });
      } catch (e) {
        // already signed out locally; revoking is best effort
      }
    }
  }

  async function isSignedIn(): Promise<boolean> {
    return (await deps.store.get(TOKEN_KEY)) !== null;
  }

  return { getToken, dropToken, signOut, isSignedIn };
}