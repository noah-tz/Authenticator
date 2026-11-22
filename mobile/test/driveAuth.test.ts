import { describe, expect, it, vi } from "vitest";
import {
  createDriveAuth,
  NativeAuthorization,
  TOKEN_LIFETIME_MS,
} from "../src/core/driveAuth";

function setup(
  authorize: (opts: { interactive: boolean }) => Promise<{ accessToken: string }>,
  now?: () => number
) {
  const native = {
    authorize: vi.fn(authorize),
    clearToken: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  };
  const auth = createDriveAuth({
    native: native as unknown as NativeAuthorization,
    now,
  });
  return { auth, native };
}

const consent = () => Object.assign(new Error("consent"), { code: "CONSENT_REQUIRED" });

describe("getToken", () => {
  it("returns the token from a silent authorize and caches it", async () => {
    let clock = 1_000_000;
    const t = setup(async () => ({ accessToken: "ya29.a" }), () => clock);
    expect(await t.auth.getToken(false)).toBe("ya29.a");
    expect(await t.auth.getToken(true)).toBe("ya29.a");
    expect(t.native.authorize).toHaveBeenCalledTimes(1);
    expect(t.native.authorize).toHaveBeenCalledWith({ interactive: false });
    clock += TOKEN_LIFETIME_MS + 1;
    await t.auth.getToken(false);
    expect(t.native.authorize).toHaveBeenCalledTimes(2);
  });

  it("non-interactive with consent needed rejects with AUTH_DENIED and never asks the user", async () => {
    const t = setup(async () => {
      throw consent();
    });
    await expect(t.auth.getToken(false)).rejects.toMatchObject({
      code: "AUTH_DENIED",
    });
    expect(t.native.authorize).toHaveBeenCalledTimes(1);
  });

  it("interactive tries silently first, then asks the user", async () => {
    const t = setup(async ({ interactive }) => {
      if (!interactive) {
        throw consent();
      }
      return { accessToken: "ya29.b" };
    });
    expect(await t.auth.getToken(true)).toBe("ya29.b");
    expect(t.native.authorize.mock.calls.map((c) => c[0].interactive)).toEqual([
      false,
      true,
    ]);
  });

  it("maps a denied consent screen to AUTH_DENIED", async () => {
    const t = setup(async ({ interactive }) => {
      throw interactive
        ? Object.assign(new Error("no"), { code: "AUTH_DENIED" })
        : consent();
    });
    await expect(t.auth.getToken(true)).rejects.toMatchObject({
      code: "AUTH_DENIED",
    });
  });

  it("hides tokens in other failures", async () => {
    const t = setup(async () => {
      throw new Error("boom Bearer ya29.leak");
    });
    try {
      await t.auth.getToken(true);
      expect.unreachable();
    } catch (e) {
      expect((e as { code: string }).code).toBe("HTTP");
      expect((e as { detail?: string }).detail).not.toContain("ya29.leak");
    }
  });

  it("rejects an empty token", async () => {
    const t = setup(async () => ({ accessToken: "" }));
    await expect(t.auth.getToken(false)).rejects.toMatchObject({ code: "HTTP" });
  });
});

describe("dropToken and signOut", () => {
  it("dropToken clears the cache and tells the native side", async () => {
    let n = 0;
    const t = setup(async () => ({ accessToken: `ya29.${++n}` }));
    const first = await t.auth.getToken(false);
    await t.auth.dropToken(first);
    expect(t.native.clearToken).toHaveBeenCalledWith({ accessToken: first });
    expect(await t.auth.getToken(false)).toBe("ya29.2");
  });

  it("signOut revokes access and clears the cache", async () => {
    let n = 0;
    const t = setup(async () => ({ accessToken: `ya29.${++n}` }));
    await t.auth.getToken(false);
    await t.auth.signOut();
    expect(t.native.signOut).toHaveBeenCalledTimes(1);
    expect(await t.auth.getToken(false)).toBe("ya29.2");
  });
});
