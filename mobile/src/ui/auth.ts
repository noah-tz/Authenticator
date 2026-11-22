import { registerPlugin } from "@capacitor/core";
import { createDriveAuth, DriveAuthHandle, NativeAuthorization } from "../core/driveAuth";
import { isWeb } from "../core/platform";
import { createWebAuthorization } from "../core/webAuth";
// Local plugin: android/app/src/main/java/.../GoogleAuthorizationPlugin.java
const GoogleAuthorization =
  registerPlugin<NativeAuthorization>("GoogleAuthorization");
export function createAuth(): DriveAuthHandle {
  return createDriveAuth({
    native: isWeb() ? createWebAuthorization() : GoogleAuthorization,
  });
}
