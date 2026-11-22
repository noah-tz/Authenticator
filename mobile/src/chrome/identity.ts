import { callWithLastError } from "./runtime";
import { dual, Callback } from "./dual";

// What the popup would ask the Chrome identity API for is answered by the
// native Google authorization (wired in the device integration).
export type TokenProvider = (interactive: boolean) => Promise<string>;
export type TokenDropper = (token: string) => Promise<void>;

let provider: TokenProvider = () =>
  Promise.reject(new Error("Google sign-in is not available yet"));
let dropper: TokenDropper = async () => undefined;

export function setIdentityProviders(
  get: TokenProvider,
  drop: TokenDropper
): void {
  provider = get;
  dropper = drop;
}

export function createIdentity() {
  return {
    getAuthToken(
      details: { interactive?: boolean } | undefined,
      callback?: (token?: string) => void
    ): Promise<string> | undefined {
      if (typeof callback === "function") {
        provider(Boolean(details?.interactive)).then(
          (token) => callback(token),
          (e) =>
            callWithLastError(
              () => callback(undefined),
              e instanceof Error ? e.message : String(e)
            )
        );
        return undefined;
      }
      return provider(Boolean(details?.interactive));
    },
    removeCachedAuthToken(
      details: { token: string },
      callback?: Callback<void>
    ): Promise<void> | undefined {
      return dual(callback, () => dropper(details.token));
    },
  };
}
