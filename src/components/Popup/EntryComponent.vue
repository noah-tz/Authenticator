<template>
  <a
    role="button"
    data-x-role="entry"
    v-bind:tabindex="tabindex"
    v-bind:class="{
      entry: true,
      pinnedEntry: entry.pinned,
      'no-copy': noCopy(entry.code),
    }"
    v-on:click="copyCode(entry)"
    v-on:keydown.enter="copyCode(entry)"
    v-on:contextmenu="openContextMenu($event)"
  >
    <div class="deleteAction" v-on:click="removeEntry(entry)">
      <IconMinusCircle />
    </div>
    <div
      class="sector"
      v-if="entry.type !== OTPType.hotp && entry.type !== OTPType.hhex"
      v-show="sectorStart"
    >
      <svg viewBox="0 0 16 16">
        <circle
          cx="8"
          cy="8"
          r="4"
          v-bind:style="{
            animationDuration: entry.period + 's',
            animationDelay: (sectorOffset % entry.period) + 's',
          }"
        />
      </svg>
    </div>
    <div
      v-bind:class="{ counter: true, disabled: style.hotpDiabled }"
      v-if="entry.type === OTPType.hotp || entry.type === OTPType.hhex"
      v-on:click="nextCode(entry)"
    >
      <IconRedo />
    </div>
    <div class="issuer">
      {{
        entry.issuer.split("::")[0] +
        (theme === "compact" ? ` (${entry.account})` : "")
      }}
    </div>
    <div class="issuerEdit">
      <input
        v-bind:placeholder="i18n.issuer"
        type="text"
        v-model="entry.issuer"
        v-on:change="entry.update(encryption)"
      />
    </div>
    <div
      v-bind:class="{
        code: true,
        hotp: entry.type === OTPType.hotp || entry.type === OTPType.hhex,
        timeout: entry.period - (second % entry.period) < 5,
      }"
      v-html="style.isEditing ? showBulls(entry) : showCode(entry.code)"
    ></div>
    <div class="issuer account">{{ entry.account }}</div>
    <div class="issuerEdit">
      <input
        v-bind:placeholder="i18n.accountName"
        type="text"
        v-model="entry.account"
        v-on:change="entry.update(encryption)"
      />
    </div>
    <div class="issuerEdit folderEdit">
      <input
        v-bind:placeholder="i18n.folder_placeholder"
        v-bind:aria-label="i18n.folder"
        type="text"
        v-model="draftFolder"
        v-on:change="commitDraftFolder()"
        v-on:input="onFolderInput()"
        v-on:focus="openFolderPicker()"
        v-on:click.stop="openFolderPicker()"
        v-on:keydown.stop
        v-on:keydown.enter="commitFolder($event)"
        v-on:keydown.down.prevent="onFolderPickerKeydown($event)"
        v-on:keydown.up.prevent="onFolderPickerKeydown($event)"
        v-on:keydown.esc="closeFolderPicker()"
      />
      <!--
        Small caret inside the field's right edge. Opens the controlled
        dropdown of matching folders. .stop keeps the row's copyCode from
        firing. Free-typing in the input still works independently.
      -->
      <div
        class="folderCaretBtn"
        role="button"
        tabindex="0"
        v-bind:aria-label="i18n.folder_picker"
        v-bind:title="i18n.folder_picker"
        v-on:click.stop="toggleFolderPicker()"
        v-on:keydown.stop="onFolderPickerKeydown($event)"
      >
        &#9662;
      </div>
      <ul
        class="folderPickerMenu"
        v-show="showFolderPicker"
        tabindex="-1"
        v-on:click.stop
        v-on:mousedown.stop
        v-on:keydown.stop="onFolderPickerKeydown($event)"
      >
        <li
          class="folderPickerClose"
          role="button"
          v-bind:aria-label="i18n.close"
          v-bind:title="i18n.close"
          v-on:click.stop="closeFolderPicker()"
        >
          &times;
        </li>
        <li v-if="matchingFolders.length === 0" class="folderPickerEmpty">
          {{ i18n.ungrouped }}
        </li>
        <li
          v-for="(name, i) in matchingFolders"
          :key="name"
          v-bind:class="{ folderPickerActive: i === folderPickerIndex }"
          v-on:click.stop="chooseFolder(name)"
          v-on:mouseenter="folderPickerIndex = i"
        >
          {{ name }}
        </li>
      </ul>
    </div>
    <div
      class="showqr"
      v-if="shouldShowQrIcon(entry)"
      v-on:click.stop="showQr(entry)"
    >
      <IconQr />
    </div>
    <div class="pin" v-on:click.stop="pin(entry)">
      <IconPin />
    </div>
    <div class="movehandle">
      <IconBars />
    </div>
  </a>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState, mapGetters } from "vuex";
import * as QRGen from "qrcode-generator";
import { OTPEntry, OTPType, CodeState, OTPAlgorithm } from "../../models/otp";
import { EntryStorage } from "../../models/storage";
import { normalizeFolderPath } from "../../models/folders";
import { getCurrentTab, okToInjectContentScript } from "../../utils";

import IconMinusCircle from "../../../svg/minus-circle.svg";
import IconRedo from "../../../svg/redo.svg";
import IconQr from "../../../svg/qrcode.svg";
import IconBars from "../../../svg/bars.svg";
import IconPin from "../../../svg/pin.svg";

const computedPrototype = [
  mapState("accounts", [
    "OTPType",
    "sectorStart",
    "sectorOffset",
    "second",
    "encryption",
  ]),
  mapState("style", ["style"]),
  mapState("menu", ["theme"]),
];

let computed = {};

for (const module of computedPrototype) {
  Object.assign(computed, module);
}

Object.assign(computed, mapGetters("accounts", ["folders"]));

// Whether THIS entry's folder picker is the one currently open. Reads the
// store (keyed by hash) so it is immune to component rebuilds on re-render.
Object.assign(computed, {
  showFolderPicker(this: {
    entry: OTPEntry;
    $store: { state: { accounts: { openFolderPicker: string } } };
  }) {
    return this.$store.state.accounts.openFolderPicker === this.entry.hash;
  },
  // Existing folder paths filtered by what the user has typed, so the
  // controlled dropdown doubles as the autocomplete the native datalist used
  // to provide. Case-insensitive substring match; empty draft shows all.
  matchingFolders(this: {
    draftFolder: string;
    $store: { getters: { [k: string]: string[] } };
  }): string[] {
    const all = this.$store.getters["accounts/folders"];
    const q = (this.draftFolder || "").trim().toLowerCase();
    if (!q) {
      return all;
    }
    return all.filter((name) => name.toLowerCase().includes(q));
  },
});

export default Vue.extend({
  computed,
  props: {
    entry: OTPEntry,
    tabindex: Number,
  },
  data() {
    return {
      // Highlighted item index for keyboard navigation inside the picker.
      folderPickerIndex: -1,
      // Local draft decoupled from the store. Typing updates only this, so the
      // folder tree (built from entry.folder in the store) does NOT re-render
      // on each keystroke and never steals focus mid-edit. Committed on
      // blur/Enter via commitDraftFolder().
      draftFolder: this.entry.folder || "",
    };
  },
  watch: {
    // Keep the local draft in sync if the entry's folder changes from
    // elsewhere (e.g. sync update), but never clobber what the user is typing.
    "entry.folder"(newVal: string) {
      if (newVal !== this.draftFolder) {
        this.draftFolder = newVal || "";
      }
    },
  },
  methods: {
    openContextMenu(event: MouseEvent) {
      // Right-click opens the archive/restore menu. Suppress the native menu
      // and keep the click from reaching copyCode. Open state lives in the
      // store keyed by this entry's hash with the cursor position; the menu
      // itself is rendered once, centrally, in MainBody.
      event.preventDefault();
      event.stopPropagation();
      this.$store.commit("accounts/setContextMenu", {
        hash: this.entry.hash,
        x: event.clientX,
        y: event.clientY,
      });
    },
    toggleFolderPicker() {
      if (this.$store.state.accounts.openFolderPicker === this.entry.hash) {
        this.closeFolderPicker();
      } else {
        this.openFolderPicker();
      }
    },
    onFolderInput() {
      // Typing opens the controlled dropdown so matching existing folders are
      // suggested live (replacing the removed native datalist autocomplete).
      // Only open when there is actually something to suggest.
      const all: string[] = this.$store.getters["accounts/folders"];
      const q = (this.draftFolder || "").trim().toLowerCase();
      const hasMatch = q
        ? all.some((name) => name.toLowerCase().includes(q))
        : all.length > 0;
      if (hasMatch) {
        if (this.$store.state.accounts.openFolderPicker !== this.entry.hash) {
          this.$store.commit("accounts/setOpenFolderPicker", this.entry.hash);
        }
      } else {
        this.closeFolderPicker();
      }
      this.folderPickerIndex = -1;
    },
    openFolderPicker() {
      // Open state lives in the store keyed by this entry's stable hash, so
      // the frequent folder-tree re-render (which rebuilds EntryComponent
      // instances) can never reset it. The dropdown closes ONLY on an explicit
      // user action: choosing an item, clicking its close icon, or Escape.
      // There is deliberately no outside-click / blur / timer close, because
      // those were what closed it spuriously on re-render and mouse movement.
      this.$store.commit("accounts/setOpenFolderPicker", this.entry.hash);
      this.folderPickerIndex = -1;
    },
    closeFolderPicker() {
      if (this.$store.state.accounts.openFolderPicker === this.entry.hash) {
        this.$store.commit("accounts/setOpenFolderPicker", "");
      }
      this.folderPickerIndex = -1;
    },
    onFolderPickerKeydown(event: KeyboardEvent) {
      // Keep arrow/enter/escape inside the picker so MainBody's entry
      // navigation never steals them (which was closing the dropdown).
      const isOpen =
        this.$store.state.accounts.openFolderPicker === this.entry.hash;
      if (!isOpen) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          this.openFolderPicker();
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const all: string[] = this.$store.getters["accounts/folders"];
      const q = (this.draftFolder || "").trim().toLowerCase();
      const folderList = q
        ? all.filter((name) => name.toLowerCase().includes(q))
        : all;
      const count = folderList.length;
      if (event.key === "ArrowDown") {
        this.folderPickerIndex = count
          ? (this.folderPickerIndex + 1) % count
          : -1;
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "ArrowUp") {
        this.folderPickerIndex = count
          ? (this.folderPickerIndex - 1 + count) % count
          : -1;
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "Enter") {
        if (this.folderPickerIndex >= 0 && this.folderPickerIndex < count) {
          this.chooseFolder(folderList[this.folderPickerIndex]);
        }
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "Escape") {
        this.closeFolderPicker();
        event.preventDefault();
        event.stopPropagation();
      }
    },
    chooseFolder(folder: string) {
      // Picking a path from the dropdown commits immediately.
      this.draftFolder = folder;
      this.commitDraftFolder();
      this.closeFolderPicker();
    },
    noCopy(code: string) {
      return (
        code === CodeState.Encrypted ||
        code === CodeState.Invalid ||
        code.startsWith("&bull;")
      );
    },
    shouldShowQrIcon(entry: OTPEntry) {
      return (
        !this.$store.state.menu.exportDisabled &&
        entry.secret !== null &&
        entry.type !== OTPType.battle &&
        entry.type !== OTPType.steam
      );
    },
    showCode(code: string) {
      if (code === CodeState.Encrypted) {
        return this.i18n.encrypted;
      } else if (code === CodeState.Invalid) {
        return this.i18n.invalid;
      } else {
        return code;
      }
    },
    showBulls(entry: OTPEntry) {
      if (entry.code === CodeState.Encrypted) {
        return this.i18n.encrypted;
      } else if (entry.code === CodeState.Invalid) {
        return this.i18n.invalid;
      }

      if (entry.code.startsWith("&bull;")) {
        return entry.code;
      }

      return new Array(entry.digits).fill("&bull;").join("");
    },
    async removeEntry(entry: OTPEntry) {
      if (
        await this.$store.dispatch(
          "notification/confirm",
          this.i18n.confirm_delete
        )
      ) {
        await entry.delete();
        await this.$store.dispatch("accounts/deleteCode", entry.hash);
      }
      return;
    },
    async pin(entry: OTPEntry) {
      this.$store.commit("accounts/pinEntry", entry);
      await EntryStorage.set(this.$store.state.accounts.entries);
      const codesEl = document.getElementById("codes") as HTMLDivElement;
      codesEl.scrollTop = 0;
    },
    commitFolder(event: KeyboardEvent) {
      // Enter confirms the typed path by blurring, which fires `change` ->
      // commitDraftFolder(). Typing never touches the store until this point,
      // so the user can type a full nested path like "a/b/c" uninterrupted.
      (event.target as HTMLInputElement)?.blur();
    },
    async commitDraftFolder() {
      // Normalize the typed draft and persist it to the store exactly once,
      // on blur/Enter. This is the only place typing reaches entry.folder.
      const folder = normalizeFolderPath(this.draftFolder);
      this.draftFolder = folder;
      this.entry.folder = folder;
      this.$store.commit("accounts/setFolder", {
        entry: this.entry,
        folder,
      });
      await EntryStorage.set(this.$store.state.accounts.entries);
    },
    showQr(entry: OTPEntry) {
      this.$store.commit("qr/setQr", getQrUrl(entry));
      this.$store.commit("style/showQr");
      return;
    },
    async nextCode(entry: OTPEntry) {
      if (this.$store.state.style.hotpDisabled) {
        return;
      }
      this.$store.commit("style/toggleHotpDisabled");
      await entry.next();
      setTimeout(() => {
        this.$store.commit("style/toggleHotpDisabled");
      }, 3000);
      return;
    },
    async copyCode(entry: OTPEntry) {
      if (
        this.$store.state.style.style.isEditing ||
        entry.code === CodeState.Invalid ||
        entry.code.startsWith("&bull;")
      ) {
        return;
      }

      if (entry.code === CodeState.Encrypted) {
        this.$store.commit("style/showInfo", true);
        this.$store.commit("currentView/changeView", "EnterPasswordPage");
        return;
      }

      chrome.permissions.request(
        { permissions: ["clipboardWrite"] },
        async (granted) => {
          if (granted) {
            const codeClipboard = document.getElementById(
              "codeClipboard"
            ) as HTMLInputElement;
            if (!codeClipboard) {
              return;
            }

            if (this.$store.state.menu.useAutofill) {
              await insertContentScript();
              const tab = await getCurrentTab();
              if (tab && tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  action: "pastecode",
                  code: entry.code,
                });
              }
            }

            const lastActiveElement = document.activeElement as HTMLElement;
            codeClipboard.value = entry.code;
            codeClipboard.focus();
            codeClipboard.select();
            document.execCommand("Copy");
            lastActiveElement.focus();
            this.$store.dispatch(
              "notification/ephermalMessage",
              this.i18n.copied
            );
          }
        }
      );

      return;
    },
  },
  components: {
    IconMinusCircle,
    IconRedo,
    IconQr,
    IconBars,
    IconPin,
  },
});

// TODO: move most of this to a models file and reuse for backup stuff
function getQrUrl(entry: OTPEntry) {
  const label = entry.issuer
    ? entry.issuer + ":" + entry.account
    : entry.account;
  const type =
    entry.type === OTPType.hex
      ? OTPType[OTPType.totp]
      : entry.type === OTPType.hhex
      ? OTPType[OTPType.hotp]
      : OTPType[entry.type];
  const otpauth =
    "otpauth://" +
    type +
    "/" +
    encodeURIComponent(label) +
    "?secret=" +
    entry.secret +
    (entry.issuer
      ? "&issuer=" + encodeURIComponent(entry.issuer.split("::")[0])
      : "") +
    (entry.type === OTPType.hotp || entry.type === OTPType.hhex
      ? "&counter=" + entry.counter
      : "") +
    (entry.type === OTPType.totp && entry.period !== 30
      ? "&period=" + entry.period
      : "") +
    (entry.digits !== 6 ? "&digits=" + entry.digits : "") +
    (entry.algorithm !== OTPAlgorithm.SHA1
      ? "&algorithm=" + OTPAlgorithm[entry.algorithm]
      : "");
  const qr = QRGen(0, "L");
  qr.addData(otpauth);
  qr.make();
  return qr.createDataURL(5);
}

async function insertContentScript() {
  let tab = await getCurrentTab();
  if (okToInjectContentScript(tab)) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["/dist/content.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["/css/content.css"],
    });
  }
}
</script>
