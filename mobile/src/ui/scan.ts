import {
  BarcodeFormat,
  BarcodeScanner,
  GoogleBarcodeScannerModuleInstallState,
} from "@capacitor-mlkit/barcode-scanning";
import { SyncAccount } from "../../../src/models/syncCrypto";
import { parseOtpauth } from "../core/otpauth";

export type ScanOutcome =
  | { kind: "account"; account: SyncAccount }
  | { kind: "error"; message: string };

const fail = (message: string): ScanOutcome => ({ kind: "error", message });

// Waits for the Google barcode scanner module (a Play services download).
async function installModule(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let handle: { remove(): Promise<void> } | undefined;
    const done = (ok: boolean) => {
      if (handle) {
        void handle.remove();
      }
      resolve(ok);
    };
    BarcodeScanner.addListener(
      "googleBarcodeScannerModuleInstallProgress",
      (event) => {
        if (event.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
          done(true);
        } else if (
          event.state === GoogleBarcodeScannerModuleInstallState.FAILED ||
          event.state === GoogleBarcodeScannerModuleInstallState.CANCELED
        ) {
          done(false);
        }
      }
    )
      .then((h) => {
        handle = h;
        return BarcodeScanner.installGoogleBarcodeScannerModule();
      })
      .catch(() => done(false));
  });
}

// Opens the scanner and parses the first QR code as an otpauth:// URI.
export async function scanOtpauth(): Promise<ScanOutcome> {
  try {
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) {
      return fail("QR scanning is not supported on this device. Use manual entry.");
    }
    const { available } =
      await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      const installed = await installModule();
      if (!installed) {
        return fail(
          "The Google scanner module could not be installed. Check your connection and try again, or use manual entry."
        );
      }
    }
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode],
    });
    if (barcodes.length === 0) {
      return fail("Scan cancelled.");
    }
    const account = parseOtpauth(barcodes[0].rawValue || "");
    if (!account) {
      return fail(
        "This QR code is not an otpauth:// code for a time-based or counter-based account."
      );
    }
    return { kind: "account", account };
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(text)) {
      return fail("Scan cancelled.");
    }
    return fail("Scanning failed. You can still enter the account manually.");
  }
}
