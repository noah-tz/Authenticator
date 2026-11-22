import { FolderNode, normalizeFolderPath } from "../../../src/models/folders";
import { redact } from "../../../src/models/driveApi";
import { SyncAccount } from "../../../src/models/syncCrypto";
import { normalizeSecret } from "../../../src/models/syncDiff";
import { copyText } from "../core/clipboard";
import { DriveAuthHandle } from "../core/driveAuth";
import { t } from "../core/i18n";
import {
  generateCode,
  isCounterBased,
  nextHotp,
  secondsLeft,
} from "../core/otpAccount";
import { Vault } from "../core/vault";
import { buildView, createExpandedState } from "../core/viewModel";
import { h, mount } from "./dom";
import { isWeb } from "../core/platform";
import { parseOtpauthText, scanOtpauth } from "./scan";
import { openSync } from "./sync";

export const APP_VERSION = "1.0.0";

type Screen = "list" | "sync" | "add" | "edit" | "move" | "about";

interface Ticker {
  account: SyncAccount;
  code: HTMLElement;
  bar: HTMLElement | null;
  step: number;
}

export interface AppDeps {
  root: HTMLElement;
  vault: Vault;
  auth: DriveAuthHandle;
}

export function startApp(deps: AppDeps): void {
  const { root, vault, auth } = deps;
  const folderState = createExpandedState();
  let accounts: SyncAccount[] = [];
  let screen: Screen = "list";
  let sheet: SyncAccount | null = null;
  let target: SyncAccount | null = null;
  let formError = "";
  let archiveOpen = false;
  let tickers: Ticker[] = [];
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let toastEl: HTMLElement | null = null;

  async function reload(): Promise<void> {
    accounts = await vault.list();
  }

  async function go(next: Screen): Promise<void> {
    screen = next;
    formError = "";
    sheet = null;
    await reload();
    render();
  }

  function toast(text: string): void {
    if (toastEl) {
      toastEl.remove();
    }
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastEl = h("div", { class: "toast", role: "status" }, text);
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(() => {
      if (toastEl) {
        toastEl.remove();
        toastEl = null;
      }
    }, 1500);
  }

  async function guarded(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (e) {
      toast("Could not save: " + (e instanceof Error ? redact(e.message) : "error"));
    }
  }

  function groupCode(code: string): string {
    return /^\d+$/.test(code) ? code.replace(/(\d{3})(?=\d)/g, "$1 ") : code;
  }

  function nameOf(a: SyncAccount): string {
    return a.issuer || a.account || a.type;
  }

  // ---- list screen ----

  function stepOf(a: SyncAccount, nowMs: number): number {
    const period = a.period > 0 ? a.period : 30;
    return Math.floor(nowMs / 1000 / period);
  }

  function updateTicker(tk: Ticker, nowMs: number): void {
    const a = tk.account;
    if (isCounterBased(a)) {
      return;
    }
    const step = stepOf(a, nowMs);
    if (step !== tk.step) {
      tk.step = step;
      tk.code.textContent = groupCode(generateCode(a));
    }
    if (tk.bar) {
      const period = a.period > 0 ? a.period : 30;
      tk.bar.style.width = `${(secondsLeft(a, nowMs) / period) * 100}%`;
    }
  }

  function tick(): void {
    if (screen !== "list") {
      return;
    }
    const now = Date.now();
    tickers.forEach((tk) => updateTicker(tk, now));
  }

  async function copy(code: string): Promise<void> {
    try {
      await copyText(code.replace(/\s/g, ""));
      toast(t("copied"));
    } catch (e) {
      toast("Could not copy");
    }
  }

  function row(a: SyncAccount): HTMLElement {
    const counter = isCounterBased(a);
    const code = h("span", { class: "code" }, groupCode(generateCode(a)));
    const bar = counter ? null : h("div", {});
    if (bar) {
      bar.style.width = "100%";
    }
    const tk: Ticker = {
      account: a,
      code,
      bar,
      step: stepOf(a, Date.now()),
    };
    tickers.push(tk);
    if (bar) {
      updateTicker(tk, Date.now());
    }
    const main = h(
      "button",
      {
        class: "main",
        onclick: () => void copy(code.textContent || ""),
      },
      h("span", { class: "name" }, [a.issuer, a.account].filter(Boolean).join(" · ") || a.type),
      code,
      bar ? h("div", { class: "bar" }, bar) : null
    );
    return h(
      "div",
      { class: "row" },
      main,
      counter
        ? h(
            "button",
            {
              "aria-label": "Next code",
              onclick: () =>
                void guarded(async () => {
                  await vault.update(nextHotp(a));
                  await reload();
                  render();
                }),
            },
            "Next"
          )
        : null,
      h(
        "button",
        {
          class: "icon",
          "aria-label": "Actions",
          onclick: () => {
            sheet = a;
            render();
          },
        },
        "⋮"
      )
    );
  }

  function folderNode(node: FolderNode<SyncAccount>): HTMLElement {
    const open = folderState.isExpanded(node.path);
    return h(
      "div",
      null,
      h(
        "button",
        {
          class: "folder-head",
          "aria-expanded": String(open),
          onclick: () => {
            folderState.toggle(node.path);
            render();
          },
        },
        open ? "▾" : "▸",
        ` ${node.name}`
      ),
      open
        ? h(
            "div",
            { class: "indent" },
            node.children.map(folderNode),
            node.entries.map(row)
          )
        : null
    );
  }

  function allFolderPaths(nodes: FolderNode<SyncAccount>[]): string[] {
    return nodes.reduce<string[]>(
      (acc, n) => acc.concat(n.path, allFolderPaths(n.children)),
      []
    );
  }

  function setAllFolders(open: boolean, paths: string[]): void {
    paths.forEach((p) => {
      if (folderState.isExpanded(p) !== open) {
        folderState.toggle(p);
      }
    });
    render();
  }

  function listScreen(): HTMLElement[] {
    const view = buildView(accounts);
    const paths = allFolderPaths(view.folders);
    const header = h(
      "div",
      { class: "header" },
      h("h1", null, "Authenticator Folders"),
      h(
        "button",
        {
          class: "icon",
          "aria-label": "Expand all",
          onclick: () => setAllFolders(true, paths),
        },
        "⊞"
      ),
      h(
        "button",
        {
          class: "icon",
          "aria-label": "Collapse all",
          onclick: () => setAllFolders(false, paths),
        },
        "⊟"
      ),
      h(
        "button",
        { class: "icon", "aria-label": t("add_code"), onclick: () => void go("add") },
        "＋"
      ),
      h(
        "button",
        {
          class: "icon",
          "aria-label": t("sync_menu"),
          onclick: () => {
            screen = "sync";
            openSync({
              vault,
              auth,
              show: (content) => mount(root, content),
              exit: () => void go("list"),
            });
          },
        },
        "⟳"
      ),
      h(
        "button",
        { class: "icon", "aria-label": "About", onclick: () => void go("about") },
        "ⓘ"
      )
    );
    const content = h("div", { class: "content" });
    if (accounts.length === 0) {
      content.appendChild(
        h("div", { class: "text muted" }, "No accounts yet. Tap + to add one.")
      );
    }
    view.folders.forEach((n) => content.appendChild(folderNode(n)));
    view.unfiled.forEach((a) => content.appendChild(row(a)));
    if (view.archived.length > 0) {
      content.appendChild(
        h(
          "button",
          {
            class: "folder-head",
            "aria-expanded": String(archiveOpen),
            onclick: () => {
              archiveOpen = !archiveOpen;
              render();
            },
          },
          archiveOpen ? "▾" : "▸",
          ` ${t("archive")} (${view.archived.length})`
        )
      );
      if (archiveOpen) {
        view.archived.forEach((a) => content.appendChild(row(a)));
      }
    }
    return [header, content];
  }

  function actionSheet(a: SyncAccount): HTMLElement {
    const close = () => {
      sheet = null;
      render();
    };
    const act = (fn: () => Promise<void>) => () =>
      void guarded(async () => {
        sheet = null;
        await fn();
        await reload();
        render();
      });
    return h(
      "div",
      {
        class: "sheet-backdrop",
        onclick: (ev: Event) => {
          if (ev.target === ev.currentTarget) {
            close();
          }
        },
      },
      h(
        "div",
        { class: "sheet" },
        h("div", { class: "text" }, h("b", null, nameOf(a))),
        h(
          "button",
          {
            class: "block",
            onclick: () => {
              target = a;
              void go("edit");
            },
          },
          t("edit")
        ),
        h(
          "button",
          {
            class: "block",
            onclick: () => {
              target = a;
              void go("move");
            },
          },
          t("folder_picker")
        ),
        h(
          "button",
          {
            class: "block",
            onclick: act(async () => {
              await vault.setArchived(a, !a.archived);
            }),
          },
          a.archived ? t("archive_restore") : t("archive_move")
        ),
        h(
          "button",
          {
            class: "block danger",
            onclick: () => {
              if (!confirm(t("confirm_delete"))) {
                return;
              }
              void act(async () => {
                await vault.remove(a);
              })();
            },
          },
          t("remove")
        ),
        h("button", { class: "block", onclick: close }, t("sync_cancel"))
      )
    );
  }

  // ---- forms ----

  function fieldInput(
    id: string,
    labelText: string,
    value = "",
    extra: Record<string, string> = {}
  ): HTMLElement[] {
    return [
      h("label", { for: id }, labelText),
      h("input", { id, value, autocomplete: "off", ...extra }),
    ];
  }

  function val(id: string): string {
    return ((document.getElementById(id) as HTMLInputElement | null)?.value || "").trim();
  }

  function selectField(
    id: string,
    labelText: string,
    options: string[],
    selected: string
  ): HTMLElement[] {
    return [
      h("label", { for: id }, labelText),
      h(
        "select",
        { id },
        options.map((o) => h("option", { value: o, selected: o === selected }, o))
      ),
    ];
  }

  async function folderField(id: string, value: string): Promise<HTMLElement[]> {
    const paths = await vault.folderPaths();
    return [
      ...fieldInput(id, t("folder"), value, {
        list: id + "-list",
        placeholder: t("folder_placeholder"),
      }),
      h(
        "datalist",
        { id: id + "-list" },
        paths.map((p) => h("option", { value: p }))
      ),
    ];
  }

  function formHeader(title: string): HTMLElement {
    return h(
      "div",
      { class: "header" },
      h(
        "button",
        { class: "icon", "aria-label": t("sync_back"), onclick: () => void go("list") },
        "←"
      ),
      h("h1", null, title)
    );
  }

  async function addScreen(): Promise<HTMLElement[]> {
    const folder = await folderField("f-folder", "");
    return [
      formHeader(t("add_code")),
      h(
        "div",
        { class: "content" },
        h(
          "button",
          {
            class: "block primary",
            onclick: () => void scan(),
          },
          t("add_qr")
        ),
        isWeb()
          ? [
              ...fieldInput("f-uri", "Paste otpauth:// URI", "", { autocapitalize: "off", spellcheck: "false" }),
              h("button", { class: "block", onclick: () => void addFromUri() }, "Add from URI"),
            ]
          : null,
        h("div", { class: "text muted" }, t("add_secret")),
        formError ? h("div", { class: "text warning", role: "alert" }, formError) : null,
        ...fieldInput("f-issuer", t("issuer")),
        ...fieldInput("f-account", t("accountName")),
        ...fieldInput("f-secret", t("secret"), "", {
          autocapitalize: "characters",
          autocorrect: "off",
          spellcheck: "false",
        }),
        ...folder,
        ...selectField("f-type", "Type", ["totp", "hotp"], "totp"),
        ...selectField("f-digits", "Digits", ["6", "7", "8"], "6"),
        ...fieldInput("f-period", "Period (seconds)", "30", { inputmode: "numeric" }),
        ...selectField("f-algorithm", "Algorithm", ["SHA1", "SHA256", "SHA512"], "SHA1"),
        h(
          "button",
          { class: "block primary", onclick: () => void saveNew() },
          "Save"
        )
      ),
    ];
  }

  async function addAccount(account: SyncAccount): Promise<boolean> {
    try {
      if (!(await vault.add(account))) {
        return false;
      }
    } catch (e) {
      formError = "Could not save: " + (e instanceof Error ? redact(e.message) : "error");
      return false;
    }
    return true;
  }

  async function saveNew(): Promise<void> {
    const secret = normalizeSecret(val("f-secret"));
    if (!secret || !/^[A-Z2-7]+$/.test(secret)) {
      formError = "The secret must be a Base32 key (letters A-Z and digits 2-7).";
      await keepForm();
      return;
    }
    const period = Number(val("f-period"));
    if (!Number.isInteger(period) || period < 1 || period > 3600) {
      formError = "Period must be a whole number of seconds.";
      await keepForm();
      return;
    }
    const type = val("f-type") || "totp";
    const account: SyncAccount = {
      type,
      secret,
      issuer: val("f-issuer"),
      account: val("f-account"),
      folder: normalizeFolderPath(val("f-folder")),
      archived: false,
      pinned: false,
      digits: Number(val("f-digits")) || 6,
      period: type === "hotp" ? 30 : period,
      algorithm: val("f-algorithm") || "SHA1",
      counter: 0,
    };
    const added = await addAccount(account);
    if (!added) {
      formError = formError || "This account already exists.";
      await keepForm();
      return;
    }
    await go("list");
  }

  // re-render the add form with the error but without losing typed values
  async function keepForm(): Promise<void> {
    const ids = ["f-issuer", "f-account", "f-secret", "f-folder", "f-type", "f-digits", "f-period", "f-algorithm"];
    const saved = ids.map((id) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "");
    await renderAsync();
    ids.forEach((id, i) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) {
        el.value = saved[i];
      }
    });
  }

  async function scan(): Promise<void> {
    await addScanned(await scanOtpauth());
  }
  async function addFromUri(): Promise<void> {
    await addScanned(parseOtpauthText(val("f-uri")));
  }
  async function addScanned(result: Awaited<ReturnType<typeof scanOtpauth>>): Promise<void> {
    if (result.kind === "error") {
      formError = result.message;
      await keepForm();
      return;
    }
    if (!(await addAccount(result.account))) {
      formError = formError || "This account already exists.";
      await keepForm();
      return;
    }
    await go("list");
    toast(nameOf(result.account));
  }

  async function editScreen(a: SyncAccount): Promise<HTMLElement[]> {
    const folder = await folderField("f-folder", a.folder);
    return [
      formHeader(t("edit")),
      h(
        "div",
        { class: "content" },
        ...fieldInput("f-issuer", t("issuer"), a.issuer),
        ...fieldInput("f-account", t("accountName"), a.account),
        ...folder,
        h(
          "button",
          {
            class: "block primary",
            onclick: () =>
              void guarded(async () => {
                await vault.update({
                  ...a,
                  issuer: val("f-issuer"),
                  account: val("f-account"),
                  folder: normalizeFolderPath(val("f-folder")),
                });
                await go("list");
              }),
          },
          "Save"
        )
      ),
    ];
  }

  async function moveScreen(a: SyncAccount): Promise<HTMLElement[]> {
    const folder = await folderField("f-folder", a.folder);
    return [
      formHeader(t("folder_picker")),
      h(
        "div",
        { class: "content" },
        h("div", { class: "text" }, h("b", null, nameOf(a))),
        ...folder,
        h(
          "button",
          {
            class: "block primary",
            onclick: () =>
              void guarded(async () => {
                await vault.update({
                  ...a,
                  folder: normalizeFolderPath(val("f-folder")),
                });
                await go("list");
              }),
          },
          "Save"
        )
      ),
    ];
  }

  // ---- about / settings ----

  function aboutScreen(): HTMLElement[] {
    return [
      formHeader("About"),
      h(
        "div",
        { class: "content" },
        h("div", { class: "text" }, `Authenticator Folders ${APP_VERSION}`),
        h("div", { class: "text" }, t("sync_no_warranty")),
        h(
          "button",
          {
            class: "block danger",
            onclick: () =>
              void guarded(async () => {
                if (!confirm("Sign out of Google Drive on this device?")) {
                  return;
                }
                await auth.signOut();
                toast("Signed out");
              }),
          },
          "Sign out of Google Drive"
        )
      ),
    ];
  }

  // ---- render ----

  async function renderAsync(): Promise<void> {
    tickers = [];
    let content: HTMLElement[];
    if (screen === "add") {
      content = await addScreen();
    } else if (screen === "edit" && target) {
      content = await editScreen(target);
    } else if (screen === "move" && target) {
      content = await moveScreen(target);
    } else if (screen === "about") {
      content = aboutScreen();
    } else {
      screen = "list";
      content = listScreen();
      if (sheet) {
        content.push(actionSheet(sheet));
      }
    }
    mount(root, content);
  }

  function render(): void {
    void renderAsync();
  }

  setInterval(tick, 1000);
  void reload().then(render);
}
