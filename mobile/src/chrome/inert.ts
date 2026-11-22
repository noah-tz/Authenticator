import { dual, Callback } from "./dual";

// Browser features the phone does not have. They exist so the shared code,
// which the extension runs unchanged, finds the objects it calls.
type TabMessageHandler = (tabId: number, message: unknown) => void;

let tabMessageHandler: TabMessageHandler = (_tabId, message) =>
  console.debug("tabs.sendMessage", message);

// Replies of the background (for example after a scan) go to the app UI.
export function setTabMessageHandler(handler: TabMessageHandler): void {
  tabMessageHandler = handler;
}

let linkOpener: (url: string) => void = (url) => {
  window.open(url, "_blank");
};

export function setLinkOpener(opener: (url: string) => void): void {
  linkOpener = opener;
}

class Emitter {
  addListener(): void {
    // never fires on the phone
  }
  removeListener(): void {
    // never fires on the phone
  }
  hasListener(): boolean {
    return false;
  }
}

export function createInert() {
  return {
    tabs: {
      query: (_query: unknown, callback?: Callback<unknown[]>) =>
        dual(callback, async () => []),
      create: (props: { url?: string }, callback?: Callback<unknown>) =>
        dual(callback, async () => {
          if (props.url) linkOpener(props.url);
          return {};
        }),
      sendMessage: (
        tabId: number,
        message: unknown,
        callback?: Callback<unknown>
      ) =>
        dual(callback, async () => {
          tabMessageHandler(tabId, message);
          return undefined;
        }),
      captureVisibleTab: (): Promise<string> =>
        Promise.reject(new Error("Screen capture is not available")),
    },
    windows: {
      WINDOW_ID_CURRENT: -2,
      getCurrent: (callback?: Callback<unknown>) =>
        dual(callback, async () => ({ id: 1, focused: true, type: "normal" })),
      create: (_props: unknown, callback?: Callback<unknown>) =>
        dual(callback, async () => undefined),
      update: (_id: number, _props: unknown, callback?: Callback<unknown>) =>
        dual(callback, async () => undefined),
    },
    scripting: {
      executeScript: () => Promise.resolve([]),
      insertCSS: () => Promise.resolve(),
    },
    contextMenus: {
      create: () => undefined,
      removeAll: (callback?: Callback<void>) =>
        dual(callback, async () => undefined),
      onClicked: new Emitter(),
    },
    commands: { onCommand: new Emitter() },
  };
}
