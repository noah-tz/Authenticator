import { dual, Callback } from "./dual";

type Listener = (
  message: unknown,
  sender: { id: string },
  sendResponse: (response?: unknown) => void
) => boolean | void | Promise<unknown>;

const listeners: Listener[] = [];
const SENDER = { id: "mobile" };

function dispatch(message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    let answered = false;
    let pending = 0;
    const respond = (response?: unknown) => {
      if (answered) return;
      answered = true;
      resolve(response);
    };
    for (const listener of [...listeners]) {
      let keepOpen: boolean | void | Promise<unknown>;
      try {
        keepOpen = listener(
          JSON.parse(JSON.stringify(message)),
          SENDER,
          respond
        );
      } catch (e) {
        console.error(e);
        continue;
      }
      if (keepOpen === true) pending++;
    }
    // Nobody will answer: settle like the browser does when the channel closes.
    if (pending === 0) respond(undefined);
  });
}

// chrome.runtime.lastError is only set while a callback runs.
export function callWithLastError(
  callback: ((...args: never[]) => void) | undefined,
  message: string
): void {
  const runtime = ((globalThis as unknown) as { chrome: { runtime: object } })
    .chrome.runtime as { lastError?: { message: string } };
  runtime.lastError = { message };
  try {
    callback?.();
  } finally {
    delete runtime.lastError;
  }
}

class Emitter<T extends (...args: never[]) => unknown> {
  protected handlers: T[] = [];
  addListener = (handler: T) => {
    this.handlers.push(handler);
  };
  removeListener = (handler: T) => {
    this.handlers = this.handlers.filter((h) => h !== handler);
  };
  hasListener = (handler: T) => this.handlers.includes(handler);
}

export function createRuntime(manifest: unknown) {
  return {
    id: "authenticator-folders-mobile",
    sendMessage(
      message: unknown,
      callback?: Callback<unknown>
    ): Promise<unknown> | undefined {
      return dual(callback, async () => {
        // always asynchronous, like the browser
        await Promise.resolve();
        return dispatch(message);
      });
    },
    onMessage: {
      addListener: (listener: Listener) => {
        listeners.push(listener);
      },
      removeListener: (listener: Listener) => {
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      },
      hasListener: (listener: Listener) => listeners.includes(listener),
    },
    getManifest: () => JSON.parse(JSON.stringify(manifest)),
    getURL: (path: string) =>
      new URL(path.replace(/^\/+/, ""), document.baseURI).href,
    onInstalled: new Emitter(),
    onStartup: new Emitter(),
  };
}
