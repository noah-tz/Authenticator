// Pure folder-path helpers and tree builder.
// No Vue/DOM/chrome imports — safe to unit test in isolation.

export const FOLDER_SEPARATOR = "/";

export interface FolderNode {
  name: string; // segment name
  path: string; // full path, the expandedFolders key
  depth: number; // 0 for top-level
  children: FolderNode[];
  entries: OTPEntryInterface[]; // entries whose full path === node.path
}

// Split a raw folder string into its trimmed, non-empty segments.
// "a//b" -> ["a", "b"]; " a / b " -> ["a", "b"]; "" -> [].
export function parseFolderPath(raw: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(FOLDER_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

// Re-join a raw folder string into a canonical path ("" when empty).
export function normalizeFolderPath(raw: string): string {
  return parseFolderPath(raw).join(FOLDER_SEPARATOR);
}

// Build a nested folder tree from a set of full paths and the entries to
// attach. Intermediate ancestor nodes are created even when only a deeper
// path names them. Each entry is attached to the node whose full path equals
// normalizeFolderPath(entry.folder). Children are sorted by segment name via
// localeCompare; entries keep their incoming (pinned-first) order.
export function buildFolderTree(
  paths: string[],
  entries: OTPEntryInterface[]
): FolderNode[] {
  const roots: FolderNode[] = [];
  const nodesByPath = new Map<string, FolderNode>();

  const ensurePath = (segments: string[]): FolderNode | null => {
    let currentChildren = roots;
    let currentNode: FolderNode | null = null;
    let currentPath = "";

    for (let depth = 0; depth < segments.length; depth++) {
      const name = segments[depth];
      currentPath = currentPath ? currentPath + FOLDER_SEPARATOR + name : name;

      let node = nodesByPath.get(currentPath);
      if (!node) {
        node = {
          name,
          path: currentPath,
          depth,
          children: [],
          entries: [],
        };
        nodesByPath.set(currentPath, node);
        currentChildren.push(node);
      }

      currentNode = node;
      currentChildren = node.children;
    }

    return currentNode;
  };

  // Create nodes (incl. intermediate ancestors) for every declared path.
  for (const path of paths) {
    ensurePath(parseFolderPath(path));
  }

  // Attach entries to the node matching their normalized full path, creating
  // the ancestor chain if a path was not already declared.
  for (const entry of entries) {
    const segments = parseFolderPath(entry.folder);
    if (segments.length === 0) {
      continue;
    }
    const node = ensurePath(segments);
    if (node) {
      node.entries.push(entry);
    }
  }

  // Sort children recursively by segment name.
  const sortChildren = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}
