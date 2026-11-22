import { describe, expect, it } from "vitest";
import { parseOtpauth } from "../src/core/otpauth";

describe("parseOtpauth", () => {
  it("parses a full totp URI", () => {
    const a = parseOtpauth(
      "otpauth://totp/GitHub:alice%40example.com?secret=jbswy3dpehpk3pxp&issuer=GitHub&period=60&digits=8&algorithm=sha256"
    );
    expect(a).toEqual({
      type: "totp",
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "GitHub",
      account: "alice@example.com",
      folder: "",
      archived: false,
      pinned: false,
      digits: 8,
      period: 60,
      algorithm: "SHA256",
      counter: 0,
    });
  });

  it("uses defaults and normalizes the secret", () => {
    const a = parseOtpauth("otpauth://totp/user?secret=jbsw%20y3dp====")!;
    expect(a.secret).toBe("JBSWY3DP");
    expect(a.digits).toBe(6);
    expect(a.period).toBe(30);
    expect(a.algorithm).toBe("SHA1");
    expect(a.issuer).toBe("");
    expect(a.account).toBe("user");
  });

  it("issuer parameter wins over the label prefix", () => {
    const a = parseOtpauth("otpauth://totp/Old:me?secret=ABCD&issuer=New")!;
    expect(a.issuer).toBe("New");
    expect(a.account).toBe("me");
  });

  it("takes the issuer from the label when there is no parameter", () => {
    const a = parseOtpauth("otpauth://totp/Acme%20Inc:me?secret=ABCD")!;
    expect(a.issuer).toBe("Acme Inc");
  });

  it("accepts only periods that divide 60", () => {
    expect(parseOtpauth("otpauth://totp/a?secret=AB&period=45")!.period).toBe(30);
    expect(parseOtpauth("otpauth://totp/a?secret=AB&period=20")!.period).toBe(20);
    expect(parseOtpauth("otpauth://totp/a?secret=AB&period=0")!.period).toBe(30);
  });

  it("limits digits to 6-8 and unknown algorithms to SHA1", () => {
    const a = parseOtpauth("otpauth://totp/a?secret=AB&digits=10&algorithm=MD5")!;
    expect(a.digits).toBe(6);
    expect(a.algorithm).toBe("SHA1");
  });

  it("parses hotp with a counter", () => {
    const a = parseOtpauth("otpauth://hotp/a?secret=AB&counter=7")!;
    expect(a.type).toBe("hotp");
    expect(a.counter).toBe(7);
  });

  it("returns null for anything else", () => {
    expect(parseOtpauth("")).toBeNull();
    expect(parseOtpauth("https://example.com")).toBeNull();
    expect(parseOtpauth("otpauth://totp/a")).toBeNull();
    expect(parseOtpauth("otpauth://steam/a?secret=AB")).toBeNull();
    expect(parseOtpauth("otpauth-migration://offline?data=abc")).toBeNull();
  });
});
