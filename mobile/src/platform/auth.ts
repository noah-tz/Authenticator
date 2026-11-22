import { registerPlugin } from "@capacitor/core";
import {
  createDriveAuth,
  DriveAuthHandle,
  NativeAuthorization,
} from "../core/driveAuth";
import { isWeb } from "../core/platform";
import { createWebAuthorization } from "../core/webAuth";
import type { TokenDropper, TokenProvider } from "../chrome/identity";

// Local plugin: android/app/src/main/java/.../GoogleAuthorizationPlugin.java
const GoogleAuthorization =
  registerPlugin<NativeAuthorization>("GoogleAuthorization");

export function createAuth(): DriveAuthHandle {
  return createDriveAuth({
    native: isWeb() ? createWebAuthorization() : GoogleAuthorization,
  });
}

// What chrome.identity.getAuthToken / removeCachedAuthToken run on.
export function identityProviders(
  auth: DriveAuthHandle = createAuth()
): { get: TokenProvider; drop: TokenDropper } {
  return {
    get: (interactive) => auth.getToken(interactive),
    drop: (token) => auth.dropToken(token),
  };
}
