<template>
  <div class="sync-page">
    <!-- Intro -->
    <div v-if="view === 'intro'">
      <div class="text">{{ i18n.sync_intro }}</div>
      <div class="text warning">{{ i18n.sync_warning_unrecoverable }}</div>
      <div class="text">{{ i18n.sync_no_warranty }}</div>
      <div class="text warning" v-if="currentlyEncrypted">
        {{ i18n.sync_unlock_first }}
      </div>
      <template v-else>
        <a-button v-on:click="start('upload')">{{ i18n.sync_upload }}</a-button>
        <a-button v-on:click="start('download')">{{
          i18n.sync_download
        }}</a-button>
        <a-button v-on:click="erase()">{{ i18n.sync_erase }}</a-button>
      </template>
    </div>

    <!-- Passphrase -->
    <div v-else-if="view === 'passphrase'">
      <div class="text warning">{{ i18n.sync_warning_unrecoverable }}</div>
      <div class="text" v-if="needConfirm">
        {{ i18n.sync_passphrase_new_info }}
      </div>
      <div class="text warning" v-if="message">{{ message }}</div>
      <a-text-input
        :label="i18n.sync_passphrase"
        type="password"
        v-model="passphrase"
        @enter="submitPassphrase()"
      />
      <a-text-input
        v-if="needConfirm"
        :label="i18n.sync_passphrase_confirm"
        type="password"
        v-model="passphraseConfirm"
        @enter="submitPassphrase()"
      />
      <a-button v-on:click="submitPassphrase()">{{
        i18n.sync_continue
      }}</a-button>
      <a-button v-on:click="reset()">{{ i18n.sync_cancel }}</a-button>
    </div>

    <!-- Working -->
    <div v-else-if="view === 'working'">
      <div class="text">{{ i18n.sync_working }}</div>
    </div>

    <!-- Conflict -->
    <div v-else-if="view === 'conflict'">
      <div class="text warning">{{ i18n.sync_conflict_title }}</div>
      <div class="text">{{ i18n.sync_conflict_info }}</div>
      <div class="text" v-if="diff.onlyLocal.length">
        <b>{{ i18n.sync_only_here }} ({{ diff.onlyLocal.length }})</b>
        <div v-for="(a, i) in shortList(diff.onlyLocal)" :key="'l' + i">
          {{ label(a) }}
        </div>
      </div>
      <div class="text" v-if="diff.onlyRemote.length">
        <b>{{ i18n.sync_only_drive }} ({{ diff.onlyRemote.length }})</b>
        <div v-for="(a, i) in shortList(diff.onlyRemote)" :key="'r' + i">
          {{ label(a) }}
        </div>
      </div>
      <div class="text" v-if="diff.changed.length">
        <b>{{ i18n.sync_changed }} ({{ diff.changed.length }})</b>
        <div v-for="(c, i) in shortList(diff.changed)" :key="'c' + i">
          {{ label(c.local) }} ({{ c.fields.join(", ") }})
        </div>
      </div>
      <div class="text warning">
        {{ i18n.sync_target_changes }} {{ targetName }}
      </div>
      <div v-if="!confirmingMirror">
        <div v-for="choice in choices" :key="choice">
          <a-button v-on:click="choose(choice)">{{
            i18n["sync_choice_" + choice]
          }}</a-button>
          <div class="text">
            {{ i18n["sync_choice_" + choice + "_info"] }}
            ({{ i18n.sync_result_added }} {{ preview(choice).added.length }},
            {{ i18n.sync_result_updated }} {{ preview(choice).updated.length }},
            {{ i18n.sync_result_removed }} {{ preview(choice).removed.length }})
          </div>
        </div>
      </div>
      <div v-else>
        <div class="text warning">{{ i18n.sync_confirm_mirror }}</div>
        <a-button v-on:click="run('mirror')">{{ i18n.ok }}</a-button>
        <a-button v-on:click="confirmingMirror = false">{{
          i18n.sync_back
        }}</a-button>
      </div>
      <a-button v-on:click="reset()">{{ i18n.sync_cancel }}</a-button>
    </div>

    <!-- Result / error -->
    <div v-else>
      <div class="text" :class="{ warning: view === 'error' }">
        {{ message }}
      </div>
      <div v-if="detail" class="text">{{ detail }}</div>
      <a-button v-on:click="reset()">{{ i18n.sync_back }}</a-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { DriveError, isConfigured, redact } from "../../models/driveClient";
import { SyncAccount, SyncError } from "../../models/syncCrypto";
import {
  AccountDiff,
  applyChoice,
  ApplyResult,
  diffAccounts,
  isInSync,
  SyncChoice,
} from "../../models/syncDiff";
import {
  applyToLocal,
  eraseRemote,
  getLocalAccounts,
  loadRemote,
  remoteExists,
  saveRemote,
} from "../../models/syncService";

// Underlying error text for the error screen (never a token).
function describe(e: unknown): string {
  if (e instanceof DriveError) {
    return [e.code, e.status, e.detail].filter(Boolean).join(" ");
  }
  if (e instanceof Error) {
    return redact(`${e.name}: ${e.message}`);
  }
  return redact(String(e));
}
type Direction = "upload" | "download";

const emptyDiff = (): AccountDiff => ({
  onlyLocal: [],
  onlyRemote: [],
  changed: [],
  same: 0,
  duplicates: 0,
});

export default Vue.extend({
  data() {
    return {
      view: "intro",
      direction: "upload" as Direction,
      passphrase: "",
      passphraseConfirm: "",
      needConfirm: false,
      message: "",
      detail: "",
      diff: emptyDiff(),
      confirmingMirror: false,
      choices: ["add", "overwrite", "mirror"] as SyncChoice[],
      // plain holders, not reactive-heavy: filled when the conflict screen opens
      local: [] as SyncAccount[],
      remote: [] as SyncAccount[],
    };
  },
  computed: {
    currentlyEncrypted(): boolean {
      return this.$store.getters["accounts/currentlyEncrypted"];
    },
    targetName(): string {
      return this.direction === "upload"
        ? this.i18n.sync_drive
        : this.i18n.sync_this_device;
    },
  },
  methods: {
    reset() {
      this.view = "intro";
      this.passphrase = "";
      this.passphraseConfirm = "";
      this.needConfirm = false;
      this.message = "";
      this.detail = "";
      this.confirmingMirror = false;
      this.diff = emptyDiff();
      this.local = [];
      this.remote = [];
    },
    shortList<T>(list: T[]): T[] {
      return list.slice(0, 10);
    },
    label(a: SyncAccount): string {
      return [a.issuer, a.account].filter(Boolean).join(": ") || a.type;
    },
    async requestIdentity(): Promise<boolean> {
      if (!isConfigured()) {
        this.fail(new DriveError("NOT_CONFIGURED"));
        return false;
      }
      // Must be the first await in the click handler to keep the user gesture.
      let granted = false;
      let detail = "";
      try {
        granted = await chrome.permissions.request({
          permissions: ["identity"],
        });
      } catch (e) {
        detail = describe(e);
      }
      if (!granted) {
        this.view = "error";
        this.message = this.i18n.sync_error_permission;
        this.detail = detail || "permissions.request returned false";
      }
      return granted;
    },
    async start(direction: Direction) {
      if (!(await this.requestIdentity())) {
        return;
      }
      this.direction = direction;
      this.passphrase = "";
      this.passphraseConfirm = "";
      this.needConfirm = false;
      this.message = "";
      this.view = "passphrase";
    },
    async erase() {
      if (!(await this.requestIdentity())) {
        return;
      }
      if (!confirm(this.i18n.sync_erase_confirm)) {
        return;
      }
      this.view = "working";
      try {
        await eraseRemote();
        this.view = "result";
        this.message = this.i18n.sync_erased;
      } catch (e) {
        this.fail(e);
      }
    },
    async submitPassphrase() {
      if (!this.passphrase) {
        this.message = this.i18n.sync_passphrase_empty;
        return;
      }
      this.message = "";
      this.view = "working";
      try {
        if (this.direction === "upload") {
          const exists = await remoteExists();
          if (!exists) {
            if (!this.needConfirm) {
              this.needConfirm = true;
              this.view = "passphrase";
              return;
            }
            if (this.passphrase !== this.passphraseConfirm) {
              this.message = this.i18n.sync_passphrase_mismatch;
              this.view = "passphrase";
              return;
            }
            await saveRemote(getLocalAccounts(this.$store), this.passphrase);
            this.view = "result";
            this.message = this.i18n.sync_uploaded;
            return;
          }
        }
        const remote = await loadRemote(this.passphrase);
        if (remote === null) {
          // download with nothing on Drive
          this.view = "result";
          this.message = this.i18n.sync_nothing_on_drive;
          return;
        }
        const local = getLocalAccounts(this.$store);
        const diff = diffAccounts(local, remote);
        if (isInSync(diff)) {
          this.view = "result";
          this.message = this.i18n.sync_in_sync;
          return;
        }
        this.local = local;
        this.remote = remote;
        this.diff = diff;
        this.confirmingMirror = false;
        this.view = "conflict";
      } catch (e) {
        this.fail(e);
      }
    },
    outcome(choice: SyncChoice): ApplyResult {
      return this.direction === "upload"
        ? applyChoice(this.remote, this.local, choice)
        : applyChoice(this.local, this.remote, choice);
    },
    preview(choice: SyncChoice): ApplyResult {
      return this.outcome(choice);
    },
    choose(choice: SyncChoice) {
      if (choice === "mirror") {
        this.confirmingMirror = true;
        return;
      }
      return this.run(choice);
    },
    async run(choice: SyncChoice) {
      this.view = "working";
      try {
        const outcome = this.outcome(choice);
        if (this.direction === "upload") {
          await saveRemote(outcome.result, this.passphrase);
        } else {
          await applyToLocal(this.$store, outcome);
        }
        this.passphrase = "";
        this.passphraseConfirm = "";
        this.view = "result";
        this.message = `${this.i18n.sync_result_done} ${this.i18n.sync_result_added}: ${outcome.added.length}, ${this.i18n.sync_result_updated}: ${outcome.updated.length}, ${this.i18n.sync_result_removed}: ${outcome.removed.length}.`;
      } catch (e) {
        this.fail(e);
      }
    },
    fail(e: unknown) {
      this.view = "error";
      this.detail = describe(e);
      this.passphrase = "";
      this.passphraseConfirm = "";
      if (e instanceof SyncError) {
        this.message =
          e.code === "WRONG_PASSPHRASE"
            ? this.i18n.sync_error_wrong_passphrase
            : this.i18n.sync_error_bad_file;
      } else if (e instanceof DriveError) {
        const key = {
          NOT_CONFIGURED: "sync_error_not_configured",
          AUTH_DENIED: "sync_error_auth",
          NETWORK: "sync_error_network",
          HTTP: "sync_error_http",
        }[e.code];
        this.message = this.i18n[key];
      } else {
        this.message = this.i18n.sync_error_generic;
      }
    },
  },
});
</script>
