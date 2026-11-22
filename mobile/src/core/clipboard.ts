import { Clipboard } from "@capacitor/clipboard";
import { isWeb } from "./platform";
export async function copyText(text: string): Promise<void> {
  if (isWeb()) {
    await navigator.clipboard.writeText(text);
    return;
  }
  await Clipboard.write({ string: text });
}
