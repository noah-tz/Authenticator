import { KeyUtilities } from "../../../src/models/key-utilities";
import { OTPAlgorithm, OTPType } from "../../../src/models/otpEnums";
import { SyncAccount } from "../../../src/models/syncCrypto";

export const INVALID_CODE = "Invalid";

export function otpType(account: SyncAccount): OTPType {
  return OTPType[account.type as keyof typeof OTPType] || OTPType.totp;
}

export function otpAlgorithm(account: SyncAccount): OTPAlgorithm {
  return (
    OTPAlgorithm[account.algorithm as keyof typeof OTPAlgorithm] ||
    OTPAlgorithm.SHA1
  );
}

function periodOf(account: SyncAccount): number {
  return account.period > 0 ? account.period : 30;
}

// KeyUtilities reads the real clock, so a custom time is passed as an offset.
export function generateCode(account: SyncAccount, nowMs?: number): string {
  try {
    const offset =
      nowMs === undefined
        ? 0
        : Math.round(nowMs / 1000) - Math.round(Date.now() / 1000);
    return KeyUtilities.generate(
      otpType(account),
      account.secret,
      account.counter,
      periodOf(account),
      account.digits,
      otpAlgorithm(account),
      offset
    );
  } catch (e) {
    return INVALID_CODE;
  }
}

export function secondsLeft(account: SyncAccount, nowMs = Date.now()): number {
  const period = periodOf(account);
  return period - (Math.floor(nowMs / 1000) % period);
}

export function isCounterBased(account: SyncAccount): boolean {
  const type = otpType(account);
  return type === OTPType.hotp || type === OTPType.hhex;
}

export function nextHotp(account: SyncAccount): SyncAccount {
  return { ...account, counter: account.counter + 1 };
}