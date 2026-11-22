import { describe, expect, it } from "vitest";
import { buildView, createExpandedState } from "../src/core/viewModel";
import { makeAccount } from "./helpers";

describe("buildView", () => {
  const accounts = [
    makeAccount({ secret: "A1", issuer: "plain" }),
    makeAccount({ secret: "A2", issuer: "work-1", folder: "Work" }),
    makeAccount({ secret: "A3", issuer: "dev-1", folder: "Work/Dev" }),
    makeAccount({ secret: "A4", issuer: "old", folder: "Work", archived: true }),
    makeAccount({ secret: "A5", issuer: "pinned", pinned: true }),
    makeAccount({
      secret: "A6",
      issuer: "work-pinned",
      folder: "Work",
      pinned: true,
    }),
  ];

  it("nests folders and keeps archived accounts out of the tree", () => {
    const view = buildView(accounts);
    expect(view.folders.map((f) => f.path)).toEqual(["Work"]);
    const work = view.folders[0];
    expect(work.children.map((c) => c.path)).toEqual(["Work/Dev"]);
    expect(work.entries.map((e) => e.issuer)).toEqual([
      "work-pinned",
      "work-1",
    ]);
    expect(work.children[0].entries.map((e) => e.issuer)).toEqual(["dev-1"]);
    expect(view.archived.map((a) => a.issuer)).toEqual(["old"]);
  });

  it("lists unfiled accounts with pinned first", () => {
    const view = buildView(accounts);
    expect(view.unfiled.map((a) => a.issuer)).toEqual(["pinned", "plain"]);
  });

  it("is empty for no accounts", () => {
    expect(buildView([])).toEqual({ folders: [], unfiled: [], archived: [] });
  });
});

describe("expanded state", () => {
  it("starts collapsed and toggles", () => {
    const state = createExpandedState();
    expect(state.expanded.size).toBe(0);
    expect(state.isExpanded("Work")).toBe(false);
    expect(state.toggle("Work")).toBe(true);
    expect(state.isExpanded("Work")).toBe(true);
    expect(state.toggle("Work")).toBe(false);
    expect(state.expanded.size).toBe(0);
  });
});
