import manifest from "../../../manifests/manifest-chrome.json";
import { createSecureStore, KeyValueStore } from "../core/kvstore";
import { createAlarms } from "./alarms";
import { initI18n, i18n } from "./i18n";
import { createIdentity } from "./identity";
import { createInert } from "./inert";
import { createPermissions } from "./permissions";
import { createRuntime } from "./runtime";
import { kvBacking, sessionBacking, StorageArea } from "./storage";

type ChangeListener = (changes: object, areaName: string) => void;

// Builds the chrome.* surface that the shared popup and background code call
// and installs it as globalThis.chrome. Only the mobile entry imports this
// file; the extension build never sees it.
export async function installChrome(
  store: KeyValueStore = createSecureStore()
): Promise<void> {
  await initI18n();

  const global: ChangeListener[] = [];
  const emit: ChangeListener = (changes, area) =>
    global.forEach((l) => l(changes, area));
  const area = (name: string) =>
    new StorageArea(name, kvBacking(store, `chrome.storage.${name}`), emit);
  const local = area("local");
  const sync = area("sync");
  const session = new StorageArea(
    "session",
    sessionBacking("chrome.storage.session"),
    emit
  );
  await Promise.all([local.load(), sync.load(), session.load()]);

  const alarms = createAlarms();
  // The popup's "close" becomes lock-and-reload: the background has already
  // cleared chrome.storage.session, so the reload shows the password page.
  window.close = () => location.reload();
  alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "autolock") {
      setTimeout(() => location.reload(), 100);
    }
  });

  const inert = createInert();
  ((globalThis as unknown) as { chrome: unknown }).chrome = {
    storage: {
      local,
      sync,
      session,
      onChanged: {
        addListener: (l: ChangeListener) => global.push(l),
        removeListener: (l: ChangeListener) => {
          const i = global.indexOf(l);
          if (i >= 0) global.splice(i, 1);
        },
      },
    },
    runtime: createRuntime(manifest),
    alarms,
    i18n,
    identity: createIdentity(),
    permissions: createPermissions(),
    ...inert,
  };
}
