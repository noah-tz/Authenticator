import { describe, expect, it } from "vitest";

describe("src/platform", () => {
  it("is not mobile when the app did not install a platform", async () => {
    expect(
      (globalThis as { __authenticatorPlatform?: unknown })
        .__authenticatorPlatform
    ).toBeUndefined();
    const { platform } = await import("../../src/platform");
    expect(platform.isMobile).toBe(false);
    expect(platform.scanQr).toBeUndefined();
    expect(platform.ready).toBeUndefined();
  });
});
