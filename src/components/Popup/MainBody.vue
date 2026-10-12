<template>
  <div
    id="codes"
    v-bind:class="{ filter: shouldFilter && filter, search: showSearch }"
  >
    <!-- Filter -->
    <div class="under-header" id="filter" v-on:click="clearFilter()">
      {{ i18n.show_all_entries }}
    </div>
    <!-- Search -->
    <div class="under-header" id="search">
      <input
        id="searchInput"
        v-model="searchText"
        v-bind:placeholder="i18n.search"
        type="text"
        tabindex="-1"
      />
      <div id="searchHint" v-if="searchText === ''">
        <div></div>
        <div id="searchHintBorder">/</div>
        <div></div>
      </div>
    </div>
    <!-- Entries (flat list, drag-reorderable) when no folders exist -->
    <div
      v-if="folders.length === 0"
      v-dragula
      drake="entryDrake"
      v-on:keydown.down="focusNextEntry()"
      v-on:keydown.right="focusNextEntry()"
      v-on:keydown.up="focusLastEntry()"
      v-on:keydown.left="focusLastEntry()"
    >
      <EntryComponent
        v-for="entry in entries"
        :key="entry.hash"
        v-bind:filtered="!entry.pinned && !isMatchedEntry(entry)"
        v-bind:notSearched="!isSearchedEntry(entry)"
        v-bind:entry="entry"
        v-bind:tabindex="getTabindex(entry)"
      />
      <div class="no-entry" v-if="entries.length === 0 && initComplete">
        <IconKey />
        <p>
          {{ i18n.no_entires }}
          <a href="#" v-on:click="openLink('https://otp.ee/quickstart')">{{
            i18n.learn_more
          }}</a>
        </p>
      </div>
    </div>
    <!--
      Entries grouped into a nested, collapsible folder TREE.
      NOTE: drag-reorder is intentionally DISABLED inside folder sections.
      v-dragula reorders by raw array index; interleaving a nested tree
      (headers + entries at mixed depths) with the entryDrake drake would
      corrupt that index ordering, so the flat drag path above is only used
      when no folders exist. Pinned-first order comes from the `entries`
      getter, which buildFolderTree preserves per node.
    -->
    <div
      v-else
      class="folderSection"
      v-on:keydown.down="focusNextEntry()"
      v-on:keydown.right="focusNextEntry()"
      v-on:keydown.up="focusLastEntry()"
      v-on:keydown.left="focusLastEntry()"
    >
      <!-- Always-present Ungrouped group for entries with an empty folder. -->
      <div
        class="folderHeader depth-0"
        role="button"
        v-on:click="toggleFolder('')"
      >
        <span
          v-bind:class="{ folderCaret: true, collapsed: isFolderCollapsed('') }"
        ></span>
        {{ i18n.ungrouped }}
      </div>
      <template v-if="!isFolderCollapsed('')">
        <EntryComponent
          v-for="entry in ungroupedEntries"
          :key="entry.hash"
          class="folderEntry depth-1"
          v-bind:filtered="!entry.pinned && !isMatchedEntry(entry)"
          v-bind:notSearched="!isSearchedEntry(entry)"
          v-bind:entry="entry"
          v-bind:tabindex="getTabindex(entry)"
        />
      </template>
      <!--
        Pre-order-flattened tree rows. Each row is either a folder header or
        an entry, carrying its own depth; rows hidden by a collapsed ancestor
        are filtered out of flatFolderTree, so no extra v-show nesting needed.
      -->
      <template v-for="row in flatFolderTree">
        <div
          v-if="row.kind === 'header'"
          :key="'h:' + row.path"
          class="folderHeader"
          v-bind:class="'depth-' + Math.min(row.depth, 4)"
          role="button"
          v-on:click="toggleFolder(row.path)"
        >
          <span
            v-bind:class="{
              folderCaret: true,
              collapsed: isFolderCollapsed(row.path),
            }"
          ></span>
          {{ row.name }}
        </div>
        <EntryComponent
          v-else
          :key="'e:' + row.entry.hash"
          class="folderEntry"
          v-bind:class="'depth-' + Math.min(row.depth, 4)"
          v-bind:filtered="!row.entry.pinned && !isMatchedEntry(row.entry)"
          v-bind:notSearched="!isSearchedEntry(row.entry)"
          v-bind:entry="row.entry"
          v-bind:tabindex="getTabindex(row.entry)"
        />
      </template>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState, mapGetters } from "vuex";
import { OTPEntry } from "../../models/otp";
import { EntryStorage } from "../../models/storage";
import { buildFolderTree, FolderNode } from "../../models/folders";

import EntryComponent from "./EntryComponent.vue";

// A single pre-order-flattened tree row: a folder header or an entry.
type FolderRow =
  | { kind: "header"; path: string; name: string; depth: number }
  | { kind: "entry"; entry: OTPEntry; depth: number };

// import IconPlus from "../../../svg/plus.svg";
import IconKey from "../../../svg/key-solid.svg";

const computed: {
  filter: () => boolean;
  showSearch: () => boolean;
  shouldFilter: () => boolean;
  entries: () => OTPEntry[];
  folders: () => string[];
  collapsedFolders: () => string[];
} = {
  ...mapState("accounts", [
    "filter",
    "showSearch",
    "initComplete",
    "collapsedFolders",
  ]),
  ...mapGetters("accounts", ["shouldFilter", "entries", "folders"]),
};

export default Vue.extend({
  data: function () {
    return {
      searchText: "",
    };
  },
  computed: {
    ...computed,
    // Entries with no folder — always shown under the Ungrouped group.
    ungroupedEntries(): OTPEntry[] {
      return this.entries.filter((entry) => !entry.folder);
    },
    // Nested tree of the distinct full folder paths with their entries.
    folderTree(): FolderNode[] {
      return buildFolderTree(this.folders, this.entries) as FolderNode[];
    },
    // Pre-order flatten of folderTree. A node's header row is emitted, then
    // its direct entries (one indent step deeper), then its children. Rows
    // under a collapsed ancestor are omitted entirely.
    flatFolderTree(): FolderRow[] {
      const rows: FolderRow[] = [];
      const walk = (nodes: FolderNode[]) => {
        for (const node of nodes) {
          rows.push({
            kind: "header",
            path: node.path,
            name: node.name,
            depth: node.depth,
          });
          if (this.isFolderCollapsed(node.path)) {
            continue;
          }
          for (const entry of node.entries) {
            rows.push({
              kind: "entry",
              entry: entry as OTPEntry,
              depth: node.depth + 1,
            });
          }
          walk(node.children);
        }
      };
      walk(this.folderTree);
      return rows;
    },
  },
  methods: {
    openLink(url: string) {
      window.open(url, "_blank");
      return;
    },
    isMatchedEntry(entry: OTPEntry) {
      for (const hash of this.$store.getters["accounts/matchedEntries"]) {
        if (entry.hash === hash) {
          return true;
        }
      }
      return false;
    },
    isSearchedEntry(entry: OTPEntry) {
      if (this.searchText === "") {
        return true;
      }
      if (
        entry.issuer.toLowerCase().includes(this.searchText.toLowerCase()) ||
        entry.account.toLowerCase().includes(this.searchText.toLowerCase())
      ) {
        return true;
      } else {
        return false;
      }
    },
    clearFilter() {
      this.$store.dispatch("accounts/clearFilter");
    },
    toggleFolder(name: string) {
      this.$store.commit("accounts/toggleFolderCollapsed", name);
    },
    isFolderCollapsed(name: string) {
      return this.collapsedFolders.includes(name);
    },
    isEntryVisible(entry: OTPEntry) {
      return (
        this.isSearchedEntry(entry) &&
        (entry.pinned ||
          !this.shouldFilter ||
          !this.filter ||
          this.isMatchedEntry(entry))
      );
    },
    getTabindex(entry: OTPEntry) {
      const firstEntry = this.entries.find((entry) =>
        this.isEntryVisible(entry)
      );

      return entry === firstEntry ? 0 : -1;
    },
    findNextEntryIndex(reverse: boolean) {
      if (document.activeElement?.getAttribute("data-x-role") !== "entry") {
        return -1;
      }

      const activeIndex = Array.prototype.indexOf.call(
        document.querySelectorAll(".entry"),
        document.activeElement
      );
      if (activeIndex === -1) {
        return -1;
      }

      // reverse modify origin array, and use slice() to make a clone first
      const _entries = reverse ? this.entries.slice().reverse() : this.entries;

      let nextIndex = _entries.findIndex(
        (entry, index) =>
          index >
            (reverse ? this.entries.length - 1 - activeIndex : activeIndex) &&
          this.isEntryVisible(entry)
      );

      if (nextIndex === -1) {
        nextIndex = _entries.findIndex((entry) => this.isEntryVisible(entry));
      }

      return nextIndex;
    },
    focusNextEntry() {
      const nextIndex = this.findNextEntryIndex(false);
      document
        .querySelector<HTMLLinkElement>(`.entry:nth-child(${nextIndex + 1})`)
        ?.focus();
    },
    focusLastEntry() {
      const lastIndex = this.entries.length - 1 - this.findNextEntryIndex(true);
      document
        .querySelector<HTMLLinkElement>(`.entry:nth-child(${lastIndex + 1})`)
        ?.focus();
    },
  },
  created() {
    // Don't drag if !isEditing
    this.$dragula.$service.options("entryDrake", {
      invalid: () => {
        if (!this.$store.state.style.style.isEditing) {
          return true;
        } else {
          return false;
        }
      },
    });

    // Update entry index if dragged
    this.$dragula.$service.eventBus.$on(
      "dropModel",
      async ({
        dragIndex,
        dropIndex,
      }: {
        dragIndex: number;
        dropIndex: number;
      }) => {
        this.$store.commit("accounts/moveCode", {
          from: dragIndex,
          to: dropIndex,
        });
        await EntryStorage.set(this.$store.state.accounts.entries);
      }
    );
  },
  components: {
    EntryComponent,
    // IconPlus,
    IconKey,
  },
});
</script>
