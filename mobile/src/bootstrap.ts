import type { PlatformServices } from "../../src/platform";
import { isWeb } from "./core/platform";
import { setIdentityProviders } from "./chrome/identity";
import { installChrome } from "./chrome/install";
import { setLinkOpener, setTabMessageHandler } from "./chrome/inert";
import { identityProviders } from "./platform/auth";
import { installDeviceBridges, openExternal } from "./platform/device";
import { createNotifier } from "./platform/notifier";
import { scanRaw } from "./platform/scan";
import { installLongPress } from "./platform/touch";

type Ready = Parameters<NonNullable<PlatformServices["ready"]>>[0];

// Handle on the popup's store, for the app integrations (scan results).
let popupContext: Ready | undefined;
let pendingNotice: string | undefined;

// Shown in the popup's notification box once the popup is mounted; used for
// problems found before it exists (for example the legacy migration).
export function showWhenReady(message: string): void {
  if (popupContext) {
    popupContext.store.commit("notification/alert", message);
  } else {
    pendingNotice = message;
  }
}

function installPlatform(): void {
  const services: PlatformServices = {
    isMobile: true,
    scanQr: scanRaw,
    ready: (ctx) => {
      popupContext = ctx;
      if (pendingNotice) {
        ctx.store.commit("notification/alert", pendingNotice);
        pendingNotice = undefined;
      }
    },
  };
  ((globalThis as unknown) as {
    __authenticatorPlatform: PlatformServices;
  }).__authenticatorPlatform = services;
}

// Everything the shared extension code expects from the browser: the platform
// seam, the chrome.* shim, sign-in, scan replies, links, downloads, touch.
// Used by every page entry (popup and import).
export async function bootstrap(): Promise<void> {
  installPlatform();
  await installChrome();
  const providers = identityProviders();
  setIdentityProviders(providers.get, providers.drop);
  setTabMessageHandler(
    createNotifier(
      () => popupContext?.store,
      (key) => chrome.i18n.getMessage(key)
    )
  );
  if (!isWeb()) {
    setLinkOpener(openExternal);
    installDeviceBridges();
  }
  installLongPress();
}
