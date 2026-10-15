<template>
  <div
    id="codes"
    v-bind:class="{ filter: shouldFilter && filter, search: showSearch }"
  >
    <!--
      Scrollable content wrapper. Holds the filter/search banner and the
      list/folder tree. It flexes to fill the frame and scrolls on its own, so
      the Archive section below stays pinned to the bottom of #codes.
    -->
    <div class="codesScroll">
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
          v-for="entry in nonArchivedEntries"
          :key="entry.hash"
          v-bind:filtered="!entry.pinned && !isMatchedEntry(entry)"
          v-bind:notSearched="!isSearchedEntry(entry)"
          v-bind:entry="entry"
          v-bind:tabindex="getTabindex(entry)"
        />
        <div
          class="no-entry"
          v-if="nonArchivedEntries.length === 0 && initComplete"
        >
          <IconKey />
          <p>
            {{ i18n.no_entires }}
            <a
              href="#"
              v-on:click="openLink('https://github.com/noah-tz/Authenticator')"
              >{{ i18n.learn_more }}</a
            >
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
            v-bind:class="{
              folderCaret: true,
              collapsed: isFolderCollapsed(''),
            }"
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
    <!--
      Bottom-anchored Archive section. ALWAYS rendered (even with zero
      archived entries) and pinned to the bottom of the #codes frame via the
      flex layout in popup.scss. Collapsed by default; the header toggles it.
      Archived entries reuse EntryComponent as-is, so their codes keep
      generating (updateCodes iterates every entry in the store).
    -->
    <div class="archiveSection">
      <div class="archiveHeader" role="button" v-on:click="toggleArchive()">
        <span
          v-bind:class="{ folderCaret: true, collapsed: archiveCollapsed }"
        ></span>
        {{ i18n.archive }}
        <span class="archiveCount">({{ archivedEntries.length }})</span>
      </div>
      <div class="archiveBody" v-if="!archiveCollapsed">
        <div class="archiveEmpty" v-if="archivedEntries.length === 0">
          {{ i18n.archive_empty }}
        </div>
        <EntryComponent
          v-for="entry in archivedEntries"
          :key="entry.hash"
          class="archiveEntry"
          v-bind:entry="entry"
          v-bind:tabindex="-1"
        />
      </div>
    </div>
    <!--
      The right-click context menu, rendered ONCE and driven entirely by store
      state (openContextMenu). Positioned at the stored cursor coordinates.
      Because open state lives in the store (not component data), the folder
      tree's frequent re-renders can't dismiss it — same lesson as the folder
      picker. Clicks inside stop propagation so choosing doesn't trip the
      outside-close listener before the commit runs.
    -->
    <div
      v-if="openContextMenu.hash"
      class="entryContextMenu"
      v-bind:style="{
        left: openContextMenu.x + 'px',
        top: openContextMenu.y + 'px',
      }"
      v-on:click.stop
      v-on:contextmenu.stop.prevent
    >
      <button
        type="button"
        class="entryContextMenuItem"
        v-on:click="toggleArchived()"
      >
        {{
          contextMenuEntry && contextMenuEntry.archived
            ? i18n.archive_restore
            : i18n.archive_move
        }}
      </button>
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
  nonArchivedEntries: () => OTPEntry[];
  archivedEntries: () => OTPEntry[];
  folders: () => string[];
  expandedFolders: () => string[];
  archiveCollapsed: () => boolean;
  openContextMenu: () => { hash: string; x: number; y: number };
} = {
  ...mapState("accounts", [
    "filter",
    "showSearch",
    "initComplete",
    "expandedFolders",
    "archiveCollapsed",
    "openContextMenu",
  ]),
  ...mapGetters("accounts", [
    "shouldFilter",
    "entries",
    "nonArchivedEntries",
    "archivedEntries",
    "folders",
  ]),
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
    // Archived entries are excluded (they live in the Archive section).
    ungroupedEntries(): OTPEntry[] {
      return this.nonArchivedEntries.filter((entry) => !entry.folder);
    },
    // Nested tree of the distinct full folder paths with their entries,
    // built from non-archived entries only.
    folderTree(): FolderNode[] {
      return buildFolderTree(
        this.folders,
        this.nonArchivedEntries
      ) as FolderNode[];
    },
    // The entry targeted by the open context menu, resolved from its hash.
    contextMenuEntry(): OTPEntry | undefined {
      if (!this.openContextMenu.hash) {
        return undefined;
      }
      return this.$store.state.accounts.entries.find(
        (entry: OTPEntry) => entry.hash === this.openContextMenu.hash
      );
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
      this.$store.commit("accounts/toggleFolderExpanded", name);
    },
    toggleArchive() {
      this.$store.commit("accounts/toggleArchiveCollapsed");
    },
    async toggleArchived() {
      // Commit the archived flag (mirrors pin()) then persist all entries and
      // close the menu. Resolved from the stored hash so it is robust to
      // re-renders.
      const entry = this.contextMenuEntry;
      if (!entry) {
        this.$store.commit("accounts/clearContextMenu");
        return;
      }
      this.$store.commit("accounts/setArchived", {
        entry,
        archived: !entry.archived,
      });
      await EntryStorage.set(this.$store.state.accounts.entries);
      this.$store.commit("accounts/clearContextMenu");
    },
    closeContextMenu() {
      if (this.$store.state.accounts.openContextMenu.hash) {
        this.$store.commit("accounts/clearContextMenu");
      }
    },
    onWindowKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        this.closeContextMenu();
      }
    },
    isFolderCollapsed(name: string) {
      // Collapsed unless the user has explicitly expanded this path.
      return !this.expandedFolders.includes(name);
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
      const firstEntry = this.nonArchivedEntries.find((entry) =>
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
      const _entries = reverse
        ? this.nonArchivedEntries.slice().reverse()
        : this.nonArchivedEntries;

      let nextIndex = _entries.findIndex(
        (entry, index) =>
          index >
            (reverse
              ? this.nonArchivedEntries.length - 1 - activeIndex
              : activeIndex) && this.isEntryVisible(entry)
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
      const lastIndex =
        this.nonArchivedEntries.length - 1 - this.findNextEntryIndex(true);
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
  mounted() {
    // Outside-close for the context menu. The opening right-click calls
    // stopPropagation in EntryComponent, so it never reaches these window
    // listeners; any subsequent click / right-click / Escape anywhere closes
    // the menu. Clicks on the menu itself stop propagation (template), so
    // choosing an item commits before this fires.
    window.addEventListener("click", this.closeContextMenu);
    window.addEventListener("contextmenu", this.closeContextMenu);
    window.addEventListener("keydown", this.onWindowKeydown);
  },
  beforeDestroy() {
    window.removeEventListener("click", this.closeContextMenu);
    window.removeEventListener("contextmenu", this.closeContextMenu);
    window.removeEventListener("keydown", this.onWindowKeydown);
  },
  components: {
    EntryComponent,
    // IconPlus,
    IconKey,
  },
});
</script>
