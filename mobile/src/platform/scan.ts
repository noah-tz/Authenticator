import {
  BarcodeFormat,
  BarcodeScanner,
  GoogleBarcodeScannerModuleInstallState,
} from "@capacitor-mlkit/barcode-scanning";
import { redact } from "../../../src/models/driveApi";
import { isWeb } from "../core/platform";

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

// Browser dev mode: webcam scan through jsQR (lazy chunk). Without a webcam
// the developer pastes the otpauth:// text instead.
async function scanWeb(): Promise<string | null> {
  try {
    const { scanWithWebcam } = await import("./webScan");
    return await scanWithWebcam();
  } catch (e) {
    console.error(e);
    const text = window.prompt("Webcam unavailable. Paste the otpauth:// text:");
    return text ? text.trim() : null;
  }
}

function fail(message: string): null {
  window.alert(message);
  return null;
}

// Opens the scanner and resolves with the raw text of the first QR code, or
// null when the user cancels or scanning is not possible (the user is told).
// The extension's getTotp parses and stores it.
export async function scanRaw(): Promise<string | null> {
  if (isWeb()) {
    return scanWeb();
  }
  try {
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) {
      return fail("QR scanning is not supported on this device.");
    }
    const { available } =
      await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available && !(await installModule())) {
      return fail(
        "The Google scanner module could not be installed. Check your connection and try again."
      );
    }
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode],
    });
    return barcodes.length > 0 ? barcodes[0].rawValue || null : null;
  } catch (e) {
    const text = redact(e instanceof Error ? e.message : String(e));
    return /cancel/i.test(text) ? null : fail("Scanning failed.");
  }
}
