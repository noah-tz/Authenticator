import { describe, expect, it } from "vitest";
import { t } from "../src/core/i18n";

describe("t", () => {
  it("returns the key when the message is missing", () => {
    expect(t("no_such_key_xyz")).toBe("no_such_key_xyz");
  });

  it("returns an existing message", () => {
    expect(t("extName")).toBe("Authenticator Folders");
  });
});
