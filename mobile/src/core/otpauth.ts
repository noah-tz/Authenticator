import { SyncAccount } from "../../../src/models/syncCrypto";
import { normalizeSecret } from "../../../src/models/syncDiff";

function decode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, "%20"));
  } catch (e) {
    return text;
  }
}

// Returns null for anything that is not a plain otpauth://totp|hotp URI
// (otpauth-migration is not supported in v1).
export function parseOtpauth(uri: string): SyncAccount | null {
  const match = /^otpauth:\/\/(totp|hotp)\/([^?]*)(?:\?(.*))?$/i.exec(
    (uri || "").trim()
  );
  if (!match) {
    return null;
  }
  const type = match[1].toLowerCase();
  const label = decode(match[2]);
  const params = new Map<string, string>();
  for (const pair of (match[3] || "").split("&")) {
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf("=");
    const key = decode(eq < 0 ? pair : pair.slice(0, eq)).toLowerCase();
    const value = eq < 0 ? "" : decode(pair.slice(eq + 1));
    if (!params.has(key)) {
      params.set(key, value);
    }
  }
  const secret = normalizeSecret(params.get("secret") || "");
  if (!secret) {
    return null;
  }
  let issuer = "";
  let account = label.trim();
  const colon = label.indexOf(":");
  if (colon >= 0) {
    issuer = label.slice(0, colon).trim();
    account = label.slice(colon + 1).trim();
  }
  const issuerParam = (params.get("issuer") || "").trim();
  if (issuerParam) {
    issuer = issuerParam;
  }
  let period = 30;
  const periodParam = Number(params.get("period"));
  if (params.has("period") && periodParam > 0 && periodParam <= 60 && 60 % periodParam === 0) {
    period = periodParam;
  }
  let digits = 6;
  const digitsParam = Number(params.get("digits"));
  if (Number.isInteger(digitsParam) && digitsParam >= 6 && digitsParam <= 8) {
    digits = digitsParam;
  }
  const algorithmParam = (params.get("algorithm") || "").toUpperCase();
  const algorithm = ["SHA1", "SHA256", "SHA512"].includes(algorithmParam)
    ? algorithmParam
    : "SHA1";
  const counterParam = Number(params.get("counter"));
  const counter =
    type === "hotp" && Number.isInteger(counterParam) && counterParam >= 0
      ? counterParam
      : 0;
  return {
    type,
    secret,
    issuer,
    account,
    folder: "",
    archived: false,
    pinned: false,
    digits,
    period,
    algorithm,
    counter,
  };
}