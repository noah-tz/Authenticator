import "mocha";
import * as chai from "chai";
import { assert } from "chai";
import * as sinonChai from "sinon-chai";

import {
  FOLDER_SEPARATOR,
  parseFolderPath,
  normalizeFolderPath,
  buildFolderTree,
} from "../../models/folders";

chai.should();
chai.use(sinonChai);
mocha.setup("bdd");

// Minimal entry stub — buildFolderTree only reads `.folder`.
const entryWithFolder = (folder: string): OTPEntryInterface =>
  ({ folder } as OTPEntryInterface);

describe("folders model", () => {
  describe("parseFolderPath", () => {
    it("splits on the separator and drops empty segments", () => {
      assert.deepEqual(parseFolderPath("a//b"), ["a", "b"]);
    });

    it("trims whitespace around segments", () => {
      assert.deepEqual(parseFolderPath(" a / b "), ["a", "b"]);
    });

    it("returns an empty array for an empty string", () => {
      assert.deepEqual(parseFolderPath(""), []);
    });
  });

  describe("normalizeFolderPath", () => {
    it("re-joins trimmed segments with the separator", () => {
      assert.equal(
        normalizeFolderPath(" a / b "),
        "a" + FOLDER_SEPARATOR + "b"
      );
    });

    it("returns an empty string when there are no segments", () => {
      assert.equal(normalizeFolderPath("  "), "");
    });
  });

  describe("buildFolderTree", () => {
    it("merges sibling paths under a single ancestor node", () => {
      const tree = buildFolderTree(["a/b", "a/c"], []);
      assert.equal(tree.length, 1);
      assert.equal(tree[0].name, "a");
      assert.equal(tree[0].path, "a");
      assert.equal(tree[0].depth, 0);
      assert.equal(tree[0].children.length, 2);
      assert.deepEqual(
        tree[0].children.map((child) => child.name),
        ["b", "c"]
      );
    });

    it("dedupes duplicate paths", () => {
      const tree = buildFolderTree(["a/b", "a/b"], []);
      assert.equal(tree.length, 1);
      assert.equal(tree[0].children.length, 1);
      assert.equal(tree[0].children[0].path, "a/b");
    });

    it("creates the full ancestor chain for a deep entry and attaches it only to the leaf", () => {
      const entry = entryWithFolder("a/b/c");
      const tree = buildFolderTree([], [entry]);

      assert.equal(tree.length, 1);
      const a = tree[0];
      assert.equal(a.path, "a");
      assert.equal(a.entries.length, 0);

      assert.equal(a.children.length, 1);
      const b = a.children[0];
      assert.equal(b.path, "a/b");
      assert.equal(b.depth, 1);
      assert.equal(b.entries.length, 0);

      assert.equal(b.children.length, 1);
      const c = b.children[0];
      assert.equal(c.path, "a/b/c");
      assert.equal(c.depth, 2);
      assert.equal(c.entries.length, 1);
      assert.strictEqual(c.entries[0], entry);
    });

    it("handles the empty/Ungrouped case: no segments, no roots", () => {
      assert.deepEqual(parseFolderPath(""), []);
      const tree = buildFolderTree([], [entryWithFolder("")]);
      assert.deepEqual(tree, []);
    });

    it("keeps entries in incoming (pinned-first) order", () => {
      const first = entryWithFolder("a");
      const second = entryWithFolder("a");
      const tree = buildFolderTree(["a"], [first, second]);
      assert.strictEqual(tree[0].entries[0], first);
      assert.strictEqual(tree[0].entries[1], second);
    });
  });
});
