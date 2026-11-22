// diagnostics first: a failure in any later module shows on screen
import { showStartupError } from "./diagnostics";
import "../../sass/import.scss";
import "./mobile.css";
import { bootstrap } from "./bootstrap";

// The import page closes itself when it is done. On the phone that means
// going back to the popup page it was opened from; chrome.storage.session
// survives the navigation, so the popup stays unlocked.
function backToPopup(): void {
  if (history.length > 1) {
    history.back();
  } else {
    location.replace("index.html");
  }
}

async function main(): Promise<void> {
  await bootstrap();
  window.close = backToPopup;
  await import("../../src/import");
}

main().catch((e) => showStartupError(e));
