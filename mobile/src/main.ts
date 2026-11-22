import "./styles.css";
import { redact } from "../../src/models/driveApi";
import { createSecureStore } from "./core/kvstore";
import { Vault, VaultCorruptError } from "./core/vault";
import { startApp } from "./ui/app";
import { createAuth } from "./ui/auth";
import { h, mount } from "./ui/dom";

const root = document.getElementById("app") as HTMLElement;

function showLoadError(e: unknown): void {
  const corrupt = e instanceof VaultCorruptError;
  mount(
    root,
    h(
      "div",
      { class: "content" },
      h("h1", null, "Authenticator Folders"),
      h(
        "div",
        { class: "text warning", role: "alert" },
        corrupt
          ? "The saved accounts could not be read. Nothing has been changed or deleted."
          : "The saved accounts could not be loaded. Nothing has been changed or deleted."
      ),
      h(
        "div",
        { class: "text muted" },
        redact(e instanceof Error ? e.message : String(e))
      ),
      h(
        "button",
        { class: "block primary", onclick: () => location.reload() },
        "Try again"
      )
    )
  );
}

async function main(): Promise<void> {
  const store = createSecureStore();
  const vault = new Vault(store);
  try {
    // surfaces unreadable data before any screen can overwrite it
    await vault.list();
  } catch (e) {
    showLoadError(e);
    return;
  }
  startApp({ root, vault, auth: createAuth() });
}

void main();
