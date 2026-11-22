import { DRIVE_APPDATA_SCOPE, GOOGLE_WEB_CLIENT_ID } from "../config";
import { NativeAuthorization } from "./driveAuth";
// Browser dev adapter: Google Identity Services token client. Implements the
// same contract as the native GoogleAuthorization plugin.
interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface GoogleOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOauth2 } };
  }
}
const GIS_SRC = "https://accounts.google.com/gsi/client";
let gisLoading: Promise<GoogleOauth2> | null = null;
function loadGis(): Promise<GoogleOauth2> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google.accounts.oauth2);
  }
  if (!gisLoading) {
    gisLoading = new Promise<GoogleOauth2>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => {
        const o = window.google?.accounts?.oauth2;
        if (o) {
          resolve(o);
        } else {
          reject({ code: "GIS_UNAVAILABLE", message: "Google sign-in script did not initialise" });
        }
      };
      s.onerror = () => {
        gisLoading = null;
        reject({ code: "GIS_UNAVAILABLE", message: "Could not load Google sign-in script" });
      };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}
export function createWebAuthorization(): NativeAuthorization {
  let lastToken = "";
  return {
    async authorize({ interactive }) {
      const oauth2 = await loadGis();
      return new Promise<{ accessToken: string }>((resolve, reject) => {
        const client = oauth2.initTokenClient({
          client_id: GOOGLE_WEB_CLIENT_ID,
          scope: DRIVE_APPDATA_SCOPE,
          callback: (r) => {
            if (r.access_token) {
              lastToken = r.access_token;
              resolve({ accessToken: r.access_token });
            } else {
              reject({
                code: interactive ? "AUTH_DENIED" : "CONSENT_REQUIRED",
                message: r.error_description || r.error || "no token",
              });
            }
          },
          error_callback: (e) =>
            reject({
              code: interactive ? "AUTH_DENIED" : "CONSENT_REQUIRED",
              message: e.message || e.type || "sign-in failed",
            }),
        });
        client.requestAccessToken({ prompt: interactive ? "" : "none" });
      });
    },
    async clearToken() {
      lastToken = "";
    },
    async signOut() {
      const token = lastToken;
      lastToken = "";
      if (token && window.google?.accounts?.oauth2) {
        window.google.accounts.oauth2.revoke(token);
      }
    },
  };
}
