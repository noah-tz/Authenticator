// diagnostics first: a failure in any later module shows on screen
import { showStartupError } from "./diagnostics";
import "../../sass/popup.scss";
import "./mobile.css";
import { isWeb } from "./core/platform";
import { createSecureStore } from "./core/kvstore";
import { bootstrap, showWhenReady } from "./bootstrap";
import { migrateVault } from "./platform/migrateVault";

function showDevBanner(): void {
  const banner = document.createElement("div");
  banner.className = "dev-banner";
  banner.setAttribute("role", "note");
  banner.textContent =
    "Browser dev mode: secrets are stored unencrypted in this browser. Use test accounts only.";
  document.body.insertBefore(banner, document.body.firstChild);
}

// Carries the accounts of the previous app version into the extension's
// storage (only when that is still empty).
async function migrateLegacyAccounts(): Promise<void> {
  const { Encryption } = await import("../../src/models/encryption");
  const { EntryStorage } = await import("../../src/models/storage");
  await migrateVault({
    legacy: createSecureStore(),
    hasEntries: async () =>
      Object.values(await chrome.storage.local.get()).some((item) => {
        const type = (item as { dataType?: string } | null)?.dataType;
        return type === "OTPStorage" || type === "EncOTPStorage";
      }),
    importEntries: (data) => EntryStorage.import(new Encryption("", ""), data),
    newHash: () => crypto.randomUUID(),
    report: showWhenReady,
  });
}

async function main(): Promise<void> {
  if (isWeb()) {
    showDevBanner();
  }
  await bootstrap();
  await migrateLegacyAccounts();
  // The extension's background handlers (lock, autolock, getTotp, Drive
  // token) run in the same page; then the popup itself.
  await import("../../src/background");
  document.getElementById("authenticator")!.textContent = "";
  await import("../../src/popup");
}

main().catch((e) => showStartupError(e));
