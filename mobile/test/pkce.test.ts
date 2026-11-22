import { describe, expect, it } from "vitest";
import {
  base64url,
  codeChallenge,
  createCodeVerifier,
  createState,
} from "../src/core/pkce";

describe("PKCE", () => {
  it("matches RFC 7636 appendix B", async () => {
    expect(
      await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("creates verifiers of 43-128 unreserved characters", () => {
    const a = createCodeVerifier();
    const b = createCodeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(a).not.toBe(b);
  });

  it("base64url has no padding or + /", () => {
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe("-__-");
  });

  it("creates distinct url-safe states", () => {
    expect(createState()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createState()).not.toBe(createState());
  });
});