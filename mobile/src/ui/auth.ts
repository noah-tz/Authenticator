import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { REDIRECT_URI } from "../config";
import { createDriveAuth, DriveAuthHandle } from "../core/driveAuth";
import { KeyValueStore } from "../core/kvstore";

const REDIRECT_TIMEOUT_MS = 10 * 60 * 1000;
// browserFinished can fire just before the redirect intent arrives
const FINISHED_GRACE_MS = 1500;

export function createAuth(store: KeyValueStore): DriveAuthHandle {
  return createDriveAuth({
    store,
    fetch: (input, init) => fetch(input, init),
    openBrowser: (url) => Browser.open({ url }),
    waitForRedirect: () =>
      new Promise<string>((resolve, reject) => {
        const handles: { remove(): Promise<void> }[] = [];
        let settled = false;
        let timers: ReturnType<typeof setTimeout>[] = [];
        const finish = (action: () => void) => {
          if (settled) {
            return;
          }
          settled = true;
          timers.forEach(clearTimeout);
          timers = [];
          handles.forEach((hd) => void hd.remove());
          action();
        };
        timers.push(
          setTimeout(
            () => finish(() => reject(new Error("timeout"))),
            REDIRECT_TIMEOUT_MS
          )
        );
        App.addListener("appUrlOpen", (event) => {
          if (event.url.startsWith(REDIRECT_URI)) {
            finish(() => {
              void Browser.close().catch(() => undefined);
              resolve(event.url);
            });
          }
        }).then((hd) => (settled ? void hd.remove() : handles.push(hd)));
        Browser.addListener("browserFinished", () => {
          timers.push(
            setTimeout(
              () => finish(() => reject(new Error("browser closed"))),
              FINISHED_GRACE_MS
            )
          );
        }).then((hd) => (settled ? void hd.remove() : handles.push(hd)));
      }),
  });
}
