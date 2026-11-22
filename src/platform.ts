// Seam for the Android app, which runs this same popup code. The app sets
// globalThis.__authenticatorPlatform before this module is evaluated. The
// extension never sets it, so isMobile is false and every guarded branch is
// skipped.
export interface PlatformServices {
  isMobile: boolean;
  // Phone camera. Resolves with the raw text of the scanned code, or null.
  scanQr?: () => Promise<string | null>;
  // Called by popup.ts once the popup is mounted.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ready?: (ctx: { store: any; i18n: { [key: string]: string } }) => void;
}

export const platform: PlatformServices = ((globalThis as unknown) as {
  __authenticatorPlatform?: PlatformServices;
}).__authenticatorPlatform || { isMobile: false };
