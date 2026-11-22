import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIdentity, setIdentityProviders } from "../src/chrome/identity";
import { createRuntime } from "../src/chrome/runtime";
import { createDriveAuth, NativeAuthorization } from "../src/core/driveAuth";
import { identityProviders } from "../src/platform/auth";

function native(over: Partial<NativeAuthorization> = {}): NativeAuthorization {
  return {
    authorize: vi.fn().mockResolvedValue({ accessToken: "ya29.token" }),
    clearToken: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function wire(n: NativeAuthorization) {
  const providers = identityProviders(createDriveAuth({ native: n }));
  setIdentityProviders(providers.get, providers.drop);
}

describe("chrome.identity shim", () => {
  let runtime: ReturnType<typeof createRuntime>;
  beforeEach(() => {
    runtime = createRuntime({});
    ((globalThis as unknown) as { chrome: unknown }).chrome = { runtime };
  });

  it("hands the token string to the callback", async () => {
    const n = native();
    wire(n);
    const token = await new Promise((resolve) =>
      createIdentity().getAuthToken({ interactive: true }, resolve)
    );
    expect(token).toBe("ya29.token");
    expect(n.authorize).toHaveBeenCalledWith({ interactive: false });
  });

  it("resolves a promise when no callback is given", async () => {
    wire(native());
    await expect(createIdentity().getAuthToken({})).resolves.toBe("ya29.token");
  });

  it("maps CONSENT_REQUIRED to runtime.lastError during the callback only", async () => {
    wire(
      native({
        authorize: vi.fn().mockRejectedValue({ code: "CONSENT_REQUIRED" }),
      })
    );
    const seen = await new Promise<{ token?: string; error?: string }>(
      (resolve) =>
        createIdentity().getAuthToken({ interactive: false }, (token) =>
          resolve({
            token,
            error: (runtime as { lastError?: { message: string } }).lastError
              ?.message,
          })
        )
    );
    expect(seen.token).toBeUndefined();
    expect(seen.error).toBe("AUTH_DENIED");
    expect((runtime as { lastError?: unknown }).lastError).toBeUndefined();
  });

  it("asks interactively after the quiet attempt needs consent", async () => {
    const authorize = vi
      .fn()
      .mockRejectedValueOnce({ code: "CONSENT_REQUIRED" })
      .mockResolvedValueOnce({ accessToken: "ya29.after-consent" });
    wire(native({ authorize }));
    await expect(createIdentity().getAuthToken({ interactive: true })).resolves.toBe(
      "ya29.after-consent"
    );
    expect(authorize).toHaveBeenLastCalledWith({ interactive: true });
  });

  it("removeCachedAuthToken tells the native plugin to forget the token", async () => {
    const n = native();
    wire(n);
    await new Promise<void>((resolve) =>
      createIdentity().removeCachedAuthToken({ token: "ya29.token" }, resolve)
    );
    expect(n.clearToken).toHaveBeenCalledWith({ accessToken: "ya29.token" });
  });
});