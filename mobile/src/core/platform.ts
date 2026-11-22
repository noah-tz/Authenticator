import { Capacitor } from "@capacitor/core";
// True in a desktop/mobile browser (npm run dev); false inside the Android app.
export const isWeb = (): boolean => Capacitor.getPlatform() === "web";
