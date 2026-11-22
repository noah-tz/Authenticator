import { DriveError, createDriveApi, redact } from "../../../src/models/driveApi";
import { SyncAccount, SyncError } from "../../../src/models/syncCrypto";
import {
  AccountDiff,
  applyChoice,
  ApplyResult,
  diffAccounts,
  isInSync,
  SyncChoice,
} from "../../../src/models/syncDiff";
import { argonDeriveKey } from "../core/argon";
import { DriveAuthHandle } from "../core/driveAuth";
import { t } from "../core/i18n";
import { createSyncRemote } from "../core/syncRemote";
import { Vault } from "../core/vault";
import { h } from "./dom";

export interface SyncDeps {
  vault: Vault;
  auth: DriveAuthHandle;
  // replaces the screen content
  show(content: HTMLElement[]): void;
  // back to the account list (reloads it)
  exit(): void;
}

type Direction = "upload" | "download";
type View =
  | "intro"
  | "passphrase"
  | "working"
  | "conflict"
  | "result"
  | "error";

const CHOICES: SyncChoice[] = ["add", "overwrite", "mirror"];

function describe(e: unknown): string {
  if (e instanceof DriveError) {
    return [e.code, e.status, e.detail ? redact(e.detail) : ""]
      .filter(Boolean)
      .join(" ");
  }
  if (e instanceof Error) {
    return redact(`${e.name}: ${e.message}`);
  }
  return redact(String(e));
}

function label(a: SyncAccount): string {
  return [a.issuer, a.account].filter(Boolean).join(": ") || a.type;
}

// Lets the browser paint the "working" state before heavy synchronous work.
function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0))
  );
}

export function openSync(deps: SyncDeps): void {
  const remote = createSyncRemote(createDriveApi(deps.auth), argonDeriveKey);
  let view: View = "intro";
  let direction: Direction = "upload";
  let needConfirm = false;
  let message = "";
  let detail = "";
  let diff: AccountDiff | null = null;
  let confirmingMirror = false;
  let local: SyncAccount[] = [];
  let remoteAccounts: SyncAccount[] = [];
  // Only held while one operation is in progress; cleared on every exit path.
  let passphrase = "";
  let passphraseConfirm = "";

  function clearSecrets(): void {
    passphrase = "";
    passphraseConfirm = "";
  }

  function reset(): void {
    clearSecrets();
    view = "intro";
    needConfirm = false;
    message = "";
    detail = "";
    diff = null;
    confirmingMirror = false;
    local = [];
    remoteAccounts = [];
    render();
  }

  function fail(e: unknown): void {
    clearSecrets();
    view = "error";
    detail = describe(e);
    if (e instanceof SyncError) {
      message =
        e.code === "WRONG_PASSPHRASE"
          ? t("sync_error_wrong_passphrase")
          : t("sync_error_bad_file") + " (" + e.code + ")";
    } else if (e instanceof DriveError) {
      const keys: Record<string, string> = {
        NOT_CONFIGURED: "sync_error_not_configured",
        AUTH_DENIED: "sync_error_auth",
        NETWORK: "sync_error_network",
        HTTP: "sync_error_http",
      };
      message = t(keys[e.code] || "sync_error_generic");
    } else {
      message = t("sync_error_generic");
    }
    render();
  }

  function outcome(choice: SyncChoice): ApplyResult {
    return direction === "upload"
      ? applyChoice(remoteAccounts, local, choice)
      : applyChoice(local, remoteAccounts, choice);
  }

  async function working(): Promise<void> {
    view = "working";
    render();
    await nextFrame();
  }

  function start(dir: Direction): void {
    direction = dir;
    clearSecrets();
    needConfirm = false;
    message = "";
    view = "passphrase";
    render();
  }

  async function erase(): Promise<void> {
    if (!confirm(t("sync_erase_confirm"))) {
      return;
    }
    try {
      await working();
      await remote.eraseRemote();
      view = "result";
      message = t("sync_erased");
      render();
    } catch (e) {
      fail(e);
    }
  }

  async function submitPassphrase(): Promise<void> {
    if (!passphrase) {
      message = t("sync_passphrase_empty");
      render();
      return;
    }
    message = "";
    try {
      await working();
      if (direction === "upload") {
        const exists = await remote.remoteExists();
        if (!exists) {
          if (!needConfirm) {
            needConfirm = true;
            view = "passphrase";
            render();
            return;
          }
          if (passphrase !== passphraseConfirm) {
            message = t("sync_passphrase_mismatch");
            view = "passphrase";
            render();
            return;
          }
          local = await deps.vault.list();
          await remote.saveRemote(local, passphrase);
          clearSecrets();
          view = "result";
          message = t("sync_uploaded");
          render();
          return;
        }
      }
      const loaded = await remote.loadRemote(passphrase);
      if (loaded === null) {
        clearSecrets();
        view = "result";
        message = t("sync_nothing_on_drive");
        render();
        return;
      }
      const mine = await deps.vault.list();
      const found = diffAccounts(mine, loaded);
      if (isInSync(found)) {
        clearSecrets();
        view = "result";
        message = t("sync_in_sync");
        render();
        return;
      }
      local = mine;
      remoteAccounts = loaded;
      diff = found;
      confirmingMirror = false;
      view = "conflict";
      render();
    } catch (e) {
      fail(e);
    }
  }

  function choose(choice: SyncChoice): void {
    if (choice === "mirror") {
      confirmingMirror = true;
      render();
      return;
    }
    void run(choice);
  }

  async function run(choice: SyncChoice): Promise<void> {
    try {
      await working();
      const applied = outcome(choice);
      if (direction === "upload") {
        await remote.saveRemote(applied.result, passphrase);
      } else {
        await deps.vault.replaceAll(applied.result);
      }
      clearSecrets();
      view = "result";
      message = `${t("sync_result_done")} ${t("sync_result_added")}: ${
        applied.added.length
      }, ${t("sync_result_updated")}: ${applied.updated.length}, ${t(
        "sync_result_removed"
      )}: ${applied.removed.length}.`;
      render();
    } catch (e) {
      fail(e);
    }
  }

  function field(
    labelText: string,
    get: () => string,
    set: (v: string) => void
  ): HTMLElement[] {
    const input = h("input", {
      type: "password",
      autocomplete: "off",
      value: get(),
      oninput: () => set((input as HTMLInputElement).value),
      onkeydown: (ev: Event) => {
        if ((ev as KeyboardEvent).key === "Enter") {
          void submitPassphrase();
        }
      },
    });
    return [h("label", null, labelText), input];
  }

  function list(title: string, lines: string[]): HTMLElement | null {
    if (lines.length === 0) {
      return null;
    }
    return h(
      "div",
      { class: "text" },
      h("b", null, `${title} (${lines.length})`),
      lines.slice(0, 10).map((l) => h("div", { class: "list-line" }, l))
    );
  }

  function render(): void {
    const header = h(
      "div",
      { class: "header" },
      h(
        "button",
        {
          class: "icon",
          "aria-label": t("sync_back"),
          onclick: () => {
            clearSecrets();
            deps.exit();
          },
        },
        "←"
      ),
      h("h1", null, t("sync_title"))
    );
    const body: (HTMLElement | null)[] = [];
    const warnings = [
      h("div", { class: "text warning" }, t("sync_warning_unrecoverable")),
    ];
    if (view === "intro") {
      body.push(h("div", { class: "text" }, t("sync_intro")), ...warnings);
      body.push(h("div", { class: "text" }, t("sync_no_warranty")));
      body.push(
        h(
          "button",
          { class: "block primary", onclick: () => start("upload") },
          t("sync_upload")
        ),
        h(
          "button",
          { class: "block", onclick: () => start("download") },
          t("sync_download")
        ),
        h(
          "button",
          { class: "block danger", onclick: () => void erase() },
          t("sync_erase")
        )
      );
    } else if (view === "passphrase") {
      body.push(...warnings);
      if (needConfirm) {
        body.push(h("div", { class: "text" }, t("sync_passphrase_new_info")));
      }
      if (message) {
        body.push(h("div", { class: "text warning" }, message));
      }
      body.push(
        ...field(t("sync_passphrase"), () => passphrase, (v) => (passphrase = v))
      );
      if (needConfirm) {
        body.push(
          ...field(
            t("sync_passphrase_confirm"),
            () => passphraseConfirm,
            (v) => (passphraseConfirm = v)
          )
        );
      }
      body.push(
        h(
          "button",
          { class: "block primary", onclick: () => void submitPassphrase() },
          t("sync_continue")
        ),
        h("button", { class: "block", onclick: () => reset() }, t("sync_cancel"))
      );
    } else if (view === "working") {
      body.push(h("div", { class: "text", role: "status" }, t("sync_working")));
    } else if (view === "conflict" && diff) {
      body.push(
        h("div", { class: "text warning" }, t("sync_conflict_title")),
        h("div", { class: "text" }, t("sync_conflict_info")),
        list(t("sync_only_here"), diff.onlyLocal.map(label)),
        list(t("sync_only_drive"), diff.onlyRemote.map(label)),
        list(
          t("sync_changed"),
          diff.changed.map((c) => `${label(c.local)} (${c.fields.join(", ")})`)
        ),
        h(
          "div",
          { class: "text warning" },
          `${t("sync_target_changes")} ${
            direction === "upload" ? t("sync_drive") : t("sync_this_device")
          }`
        )
      );
      if (!confirmingMirror) {
        for (const choice of CHOICES) {
          const p = outcome(choice);
          body.push(
            h(
              "button",
              { class: "block", onclick: () => choose(choice) },
              t("sync_choice_" + choice)
            ),
            h(
              "div",
              { class: "text muted" },
              `${t("sync_choice_" + choice + "_info")} (${t(
                "sync_result_added"
              )} ${p.added.length}, ${t("sync_result_updated")} ${
                p.updated.length
              }, ${t("sync_result_removed")} ${p.removed.length})`
            )
          );
        }
      } else {
        body.push(
          h("div", { class: "text warning" }, t("sync_confirm_mirror")),
          h(
            "button",
            { class: "block danger", onclick: () => void run("mirror") },
            t("ok")
          ),
          h(
            "button",
            {
              class: "block",
              onclick: () => {
                confirmingMirror = false;
                render();
              },
            },
            t("sync_back")
          )
        );
      }
      body.push(
        h("button", { class: "block", onclick: () => reset() }, t("sync_cancel"))
      );
    } else {
      body.push(
        h(
          "div",
          { class: view === "error" ? "text warning" : "text" },
          message
        )
      );
      if (detail) {
        body.push(h("div", { class: "text muted" }, detail));
      }
      body.push(
        h("button", { class: "block", onclick: () => reset() }, t("sync_back"))
      );
    }
    deps.show([header, h("div", { class: "content" }, body)]);
  }

  render();
}
