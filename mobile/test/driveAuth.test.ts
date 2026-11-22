import { describe, expect, it, vi } from "vitest";
import {
  AUTH_URL,
  createDriveAuth,
  REVOKE_URL,
  TOKEN_KEY,
  TOKEN_URL,
} from "../src/core/driveAuth";
import { MemoryStore } from "../src/core/kvstore";
import { codeChallenge } from "../src/core/pkce";
import { DRIVE_SCOPE } from "../../src/models/driveApi";

const CLIENT = "abc.apps.googleusercontent.com";
const REDIRECT = "il.co.dinains.authenticatorfolders:/oauth2redirect";

function tokenResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function setup(opts: {
  redirect?: (authUrl: URL) => string;
  responses?: Response[];
  store?: MemoryStore;
  now?: () => number;
}) {
  const store = opts.store || new MemoryStore();
  const responses = opts.responses || [];
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(String(init?.body || "")) });
    return responses.shift() as Response;
  });
  let authUrl: URL | null = null;
  let opened: () => void = () => undefined;
  const openedPromise = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const auth = createDriveAuth({
    store,
    clientId: CLIENT,
    redirectUri: REDIRECT,
    now: opts.now,
    fetch: fetchMock as unknown as typeof fetch,
    openBrowser: async (url) => {
      authUrl = new URL(url);
      opened();
    },
    // like the real wiring, this is started before the browser opens
    waitForRedirect: async () => {
      await openedPromise;
      return opts.redirect!(authUrl as unknown as URL);
    },
  });
  return { auth, store, calls, getAuthUrl: () => authUrl as URL | null };
}

const okRedirect = (u: URL) =>
  `${REDIRECT}?state=${u.searchParams.get("state")}&code=AUTHCODE`;

describe("interactive sign-in", () => {
  it("builds the authorize URL and exchanges the code with the PKCE verifier", async () => {
    const t = setup({
      redirect: okRedirect,
      responses: [
        tokenResponse({
          access_token: "ya29.one",
          refresh_token: "R1",
          expires_in: 3600,
        }),
      ],
    });
    expect(await t.auth.getToken(true)).toBe("ya29.one");
    const url = t.getAuthUrl()!;
    expect(`${url.origin}${url.pathname}`).toBe(AUTH_URL);
    const p = url.searchParams;
    expect(p.get("client_id")).toBe(CLIENT);
    expect(p.get("redirect_uri")).toBe(REDIRECT);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe(DRIVE_SCOPE);
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("state")).toBeTruthy();

    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].url).toBe(TOKEN_URL);
    const form = t.calls[0].body;
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("AUTHCODE");
    expect(form.get("client_id")).toBe(CLIENT);
    expect(form.get("redirect_uri")).toBe(REDIRECT);
    expect(form.get("client_secret")).toBeNull();
    // the verifier sent must hash to the challenge in the URL
    expect(await codeChallenge(form.get("code_verifier")!)).toBe(
      p.get("code_challenge")
    );
    expect(await t.store.get(TOKEN_KEY)).toBe("R1");
  });

  it("rejects a redirect with the wrong state and never calls the token endpoint", async () => {
    const t = setup({
      redirect: () => `${REDIRECT}?state=evil&code=AUTHCODE`,
    });
    await expect(t.auth.getToken(true)).rejects.toMatchObject({
      code: "AUTH_DENIED",
    });
    expect(t.calls).toHaveLength(0);
    expect(await t.store.get(TOKEN_KEY)).toBeNull();
  });

  it("maps an error redirect to AUTH_DENIED", async () => {
    const t = setup({ redirect: () => `${REDIRECT}?error=access_denied` });
    await expect(t.auth.getToken(true)).rejects.toMatchObject({
      code: "AUTH_DENIED",
    });
  });

  it("reports NOT_CONFIGURED with the placeholder client ID", async () => {
    const auth = createDriveAuth({
      store: new MemoryStore(),
      fetch: vi.fn() as unknown as typeof fetch,
      openBrowser: async () => undefined,
      waitForRedirect: async () => "",
    });
    await expect(auth.getToken(true)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });
});

describe("non-interactive and refresh", () => {
  it("interactive=false without a refresh token rejects with AUTH_DENIED", async () => {
    const t = setup({ redirect: okRedirect });
    await expect(t.auth.getToken(false)).rejects.toMatchObject({
      code: "AUTH_DENIED",
    });
    expect(t.getAuthUrl()).toBeNull();
  });

  it("refreshes with the stored refresh token and caches the access token", async () => {
    let clock = 1_000_000;
    const store = new MemoryStore();
    await store.set(TOKEN_KEY, "R1");
    const t = setup({
      store,
      now: () => clock,
      responses: [
        tokenResponse({ access_token: "ya29.a", expires_in: 3600 }),
        tokenResponse({ access_token: "ya29.b", expires_in: 3600 }),
      ],
    });
    expect(await t.auth.getToken(false)).toBe("ya29.a");
    const form = t.calls[0].body;
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("R1");
    expect(form.get("client_secret")).toBeNull();
    // cached: no second request
    clock += 3000 * 1000;
    expect(await t.auth.getToken(false)).toBe("ya29.a");
    expect(t.calls).toHaveLength(1);
    // within 60 s of expiry: refreshed
    clock += 541 * 1000;
    expect(await t.auth.getToken(false)).toBe("ya29.b");
    expect(t.calls).toHaveLength(2);
  });

  it("dropToken forces a refresh", async () => {
    const store = new MemoryStore();
    await store.set(TOKEN_KEY, "R1");
    const t = setup({
      store,
      responses: [
        tokenResponse({ access_token: "ya29.a", expires_in: 3600 }),
        tokenResponse({ access_token: "ya29.b", expires_in: 3600 }),
      ],
    });
    const first = await t.auth.getToken(false);
    await t.auth.dropToken(first);
    expect(await t.auth.getToken(false)).toBe("ya29.b");
  });

  it("invalid_grant clears the stored tokens", async () => {
    const store = new MemoryStore();
    await store.set(TOKEN_KEY, "R1");
    const t = setup({
      store,
      responses: [tokenResponse({ error: "invalid_grant" }, 400)],
    });
    await expect(t.auth.getToken(false)).rejects.toMatchObject({
      code: "AUTH_DENIED",
    });
    expect(await store.get(TOKEN_KEY)).toBeNull();
    expect(await t.auth.isSignedIn()).toBe(false);
  });

  it("other refresh failures keep the refresh token and hide tokens in the error", async () => {
    const store = new MemoryStore();
    await store.set(TOKEN_KEY, "R1");
    const t = setup({
      store,
      responses: [new Response("oops Bearer ya29.leak", { status: 500 })],
    });
    try {
      await t.auth.getToken(false);
      expect.unreachable();
    } catch (e) {
      expect((e as { code: string }).code).toBe("HTTP");
      expect((e as { detail?: string }).detail).not.toContain("ya29.leak");
    }
    expect(await store.get(TOKEN_KEY)).toBe("R1");
  });
});

describe("signOut", () => {
  it("revokes the token and clears storage", async () => {
    const store = new MemoryStore();
    await store.set(TOKEN_KEY, "R1");
    const t = setup({ store, responses: [tokenResponse({})] });
    await t.auth.signOut();
    expect(t.calls[0].url).toBe(REVOKE_URL);
    expect(t.calls[0].body.get("token")).toBe("R1");
    expect(await store.get(TOKEN_KEY)).toBeNull();
  });
});
