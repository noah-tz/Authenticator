import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateCode,
  INVALID_CODE,
  nextHotp,
  otpAlgorithm,
  otpType,
  secondsLeft,
} from "../src/core/otpAccount";
import { OTPAlgorithm, OTPType } from "../../src/models/otpEnums";
import { base32, makeAccount } from "./helpers";

const SHA1_SECRET = base32("12345678901234567890");
const SHA256_SECRET = base32("12345678901234567890123456789012");
const SHA512_SECRET = base32(
  "1234567890123456789012345678901234567890123456789012345678901234"
);

afterEach(() => {
  vi.useRealTimers();
});

describe("HOTP (RFC 4226 appendix D)", () => {
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];
  expected.forEach((code, counter) => {
    it(`counter ${counter} -> ${code}`, () => {
      const account = makeAccount({ type: "hotp", secret: SHA1_SECRET, counter });
      expect(generateCode(account)).toBe(code);
    });
  });

  it("nextHotp returns a copy with counter + 1", () => {
    const account = makeAccount({ type: "hotp", secret: SHA1_SECRET, counter: 3 });
    const next = nextHotp(account);
    expect(next.counter).toBe(4);
    expect(account.counter).toBe(3);
    expect(generateCode(next)).toBe("338314");
  });
});

describe("TOTP (RFC 6238 appendix B)", () => {
  const cases: [string, string, string, number, string][] = [
    ["SHA1", SHA1_SECRET, "59", 59, "94287082"],
    ["SHA1", SHA1_SECRET, "1111111109", 1111111109, "07081804"],
    ["SHA256", SHA256_SECRET, "59", 59, "46119246"],
    ["SHA256", SHA256_SECRET, "1111111109", 1111111109, "68084774"],
    ["SHA512", SHA512_SECRET, "59", 59, "90693936"],
    ["SHA512", SHA512_SECRET, "1111111109", 1111111109, "25091201"],
  ];
  cases.forEach(([algorithm, secret, label, seconds, code]) => {
    it(`${algorithm} at ${label} s -> ${code}`, () => {
      vi.useFakeTimers();
      vi.setSystemTime(seconds * 1000);
      const account = makeAccount({ secret, algorithm, digits: 8 });
      expect(generateCode(account)).toBe(code);
    });
  });

  it("an explicit nowMs gives the same code as the clock at that time", () => {
    const account = makeAccount({ secret: SHA1_SECRET, digits: 8 });
    expect(generateCode(account, 59000)).toBe("94287082");
  });

  it("secondsLeft counts down inside the period", () => {
    const account = makeAccount();
    expect(secondsLeft(account, 59000)).toBe(1);
    expect(secondsLeft(account, 60000)).toBe(30);
    expect(secondsLeft(account, 61000)).toBe(29);
  });
});

describe("account mapping", () => {
  it("falls back to totp / SHA1 for unknown values", () => {
    const account = makeAccount({ type: "bogus", algorithm: "MD5" });
    expect(otpType(account)).toBe(OTPType.totp);
    expect(otpAlgorithm(account)).toBe(OTPAlgorithm.SHA1);
  });

  it("returns the Invalid marker instead of throwing", () => {
    expect(generateCode(makeAccount({ secret: "" }))).toBe(INVALID_CODE);
  });
});