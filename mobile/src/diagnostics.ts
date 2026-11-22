// Installed first (before any other app module is evaluated) so a startup
// failure shows on screen instead of leaving a blank page.
import { redact } from "../../src/models/driveApi";
export function showStartupError(e: unknown): void {
  // full stack in DevTools; the on-screen text below is redacted
  console.error(e);
  const text = redact(
    e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  );
  const app =
    document.getElementById("authenticator") ||
    document.getElementById("import");
  if (!app) return;
  const box = document.createElement("div");
  box.className = "content";
  box.setAttribute("role", "alert");
  const title = document.createElement("h1");
  title.textContent = "Authenticator Folders failed to start";
  const msg = document.createElement("pre");
  msg.className = "boot-error";
  msg.textContent = text;
  box.append(title, msg);
  app.textContent = "";
  app.appendChild(box);
}
window.addEventListener("error", (ev) =>
  showStartupError(ev.error ?? ev.message)
);
window.addEventListener("unhandledrejection", (ev) =>
  showStartupError(ev.reason)
);
