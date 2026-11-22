import { Browser } from "@capacitor/browser";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { copyText } from "../core/clipboard";

// Bridges from browser features the shared popup uses to Android. Installed
// only inside the app (not in `npm run dev`, where the browser has them).

// The popup copies a code by selecting #codeClipboard and calling
// document.execCommand("Copy"), which the Android WebView does not honour for
// hidden inputs. The native command still runs; the clipboard plugin is
// written as well.
function bridgeCopy(): void {
  const original = document.execCommand.bind(document);
  document.execCommand = (
    command: string,
    showUI?: boolean,
    value?: string
  ): boolean => {
    const result = original(command, showUI, value);
    if (command.toLowerCase() === "copy") {
      const input = document.getElementById(
        "codeClipboard"
      ) as HTMLInputElement | null;
      if (input && input.value) {
        void copyText(input.value).catch((e) => console.error(e));
      }
    }
    return result;
  };
}

function bridgeLinks(): void {
  const open = window.open.bind(window);
  window.open = ((url?: string | URL, ...rest: unknown[]) => {
    const target = url === undefined ? "" : String(url);
    if (/^https?:\/\//i.test(target)) {
      void Browser.open({ url: target });
      return null;
    }
    if (target.startsWith("blob:")) {
      void shareBlob(target, "authenticator.json");
      return null;
    }
    return open(url, ...(rest as [string?, string?]));
  }) as typeof window.open;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Android WebView does not download blob: URLs. Writes the blob to the cache
// directory and offers it through the share sheet.
async function shareBlob(url: string, filename: string): Promise<void> {
  const blob = await (await fetch(url)).blob();
  const path = filename.replace(/[^\w.-]/g, "_");
  const written = await Filesystem.writeFile({
    path,
    data: toBase64(await blob.arrayBuffer()),
    directory: Directory.Cache,
  });
  await Share.share({ title: filename, url: written.uri });
}

function bridgeDownloads(): void {
  document.addEventListener(
    "click",
    (e) => {
      const link = (e.target as Element | null)?.closest?.(
        "a[download][href^='blob:']"
      ) as HTMLAnchorElement | null;
      if (!link) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      shareBlob(link.href, link.getAttribute("download") || "authenticator")
        .catch((err) => {
          if (!/cancel/i.test(String(err && err.message ? err.message : err))) {
            console.error(err);
            window.alert("Could not export the file.");
          }
        });
    },
    true
  );
}

export function installDeviceBridges(): void {
  bridgeCopy();
  bridgeLinks();
  bridgeDownloads();
}

// Used by chrome.tabs.create (the shared code opens help pages with it).
export function openExternal(url: string): void {
  void Browser.open({ url });
}
