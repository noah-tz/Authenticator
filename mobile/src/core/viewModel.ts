import {
  buildFolderTree,
  FolderNode,
  normalizeFolderPath,
} from "../../../src/models/folders";
import { SyncAccount } from "../../../src/models/syncCrypto";

export interface AccountView {
  folders: FolderNode<SyncAccount>[];
  unfiled: SyncAccount[];
  archived: SyncAccount[];
}

// pinned first; otherwise keep the incoming order (sort is stable)
function pinnedFirst(accounts: SyncAccount[]): SyncAccount[] {
  return accounts
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(y.a.pinned) - Number(x.a.pinned) || x.i - y.i)
    .map((x) => x.a);
}

export function buildView(accounts: SyncAccount[]): AccountView {
  const active = pinnedFirst(accounts.filter((a) => !a.archived));
  const filed = active.filter((a) => normalizeFolderPath(a.folder) !== "");
  const unfiled = active.filter((a) => normalizeFolderPath(a.folder) === "");
  const paths = filed.map((a) => normalizeFolderPath(a.folder));
  return {
    folders: buildFolderTree<SyncAccount>(paths, filed),
    unfiled,
    archived: pinnedFirst(accounts.filter((a) => a.archived)),
  };
}

// Expanded folder paths. Starts empty, so every folder is collapsed.
export function createExpandedState() {
  const expanded = new Set<string>();
  return {
    expanded,
    toggle(path: string): boolean {
      if (expanded.has(path)) {
        expanded.delete(path);
        return false;
      }
      expanded.add(path);
      return true;
    },
    isExpanded: (path: string) => expanded.has(path),
  };
}