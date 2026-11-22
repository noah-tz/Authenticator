// diagnostics first: a failure in any later module shows on screen
import { showStartupError } from "./diagnostics";
import "../../sass/popup.scss";
import "./mobile.css";
import type { PlatformServices } from "../../src/platform";
import { isWeb } from "./core/platform";
import { installChrome } from "./chrome/install";

type Ready = Parameters<NonNullable<PlatformServices["ready"]>>[0];

// Handle on the popup's store, for the app integrations (scan results, sync).
export let popupContext: Ready | undefined;

function installPlatform(): void {
  const services: PlatformServices = {
    isMobile: true,
    ready: (ctx) => {
      popupContext = ctx;
    },
  };
  ((globalThis as unknown) as {
    __authenticatorPlatform: PlatformServices;
  }).__authenticatorPlatform = services;
}

function showDevBanner(): void {
  const banner = document.createElement("div");
  banner.className = "dev-banner";
  banner.setAttribute("role", "note");
  banner.textContent =
    "Browser dev mode: secrets are stored unencrypted in this browser. Use test accounts only.";
  document.body.insertBefore(banner, document.body.firstChild);
}

async function main(): Promise<void> {
  if (isWeb()) {
    showDevBanner();
  }
  installPlatform();
  await installChrome();
  // The extension's background handlers (lock, autolock, getTotp, Drive
  // token) run in the same page; then the popup itself.
  await import("../../src/background");
  document.getElementById("authenticator")!.textContent = "";
  await import("../../src/popup");
}

main().catch((e) => showStartupError(e));
