// Shared helper: chrome.* APIs accept an optional trailing callback and
// otherwise return a promise.
export type Callback<T> = (result: T) => void;

export function dual<T>(
  callback: Callback<T> | undefined,
  work: () => Promise<T>
): Promise<T> | undefined {
  if (typeof callback === "function") {
    work().then(callback, (e) => {
      console.error(e);
    });
    return undefined;
  }
  return work();
}
