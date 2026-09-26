import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The phone manages groups from the AI Employees list: the rail that carries
// them on the desktop is not rendered below md. The app suite has no DOM, so
// the wiring is pinned on the component sources.

const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const header = () => source("components/agents-home/agents-home-header.tsx");

describe("AI Employees list group actions", () => {
  it("the list's title row is the shared header", () => {
    const list = source("components/agents-home/agents-home-list.tsx");
    assert.match(list, /<AgentsHomeHeader/);
  });

  it("offers New group on the phone through the group create flow", () => {
    const home = header();
    assert.match(home, /data-testid="agents-home-new-group"/);
    assert.match(home, /openCreateFlow\("team"\)/);
    assert.match(home, /t\("sidebar\.newTeam"\)/);
    assert.match(home, /disabled=\{!sidebar\.ready\}/);
  });

  it("keeps the desktop on the rail for group actions", () => {
    const home = header();
    const newGroup = home.slice(home.indexOf("function NewGroupButton"));
    assert.match(newGroup, /md:hidden/);
    const menu = home.slice(home.indexOf("<TeamFolderMenu"));
    assert.match(menu, /md:hidden/);
  });

  it("shows the folder menu only for the one picked group", () => {
    const home = header();
    assert.match(home, /selected && \(\s*<TeamFolderMenu/);
    assert.match(home, /team=\{selected\}/);
  });

  it("deleting the picked group widens the filter back to all groups", () => {
    const home = header();
    assert.match(home, /onDelete=\{\(\) => onSelect\(null\)\}/);
    const menu = source("components/shell/team-folder-menu.tsx");
    // The delete runs only from the confirm dialog, never off the menu item.
    assert.match(menu, /onSelect=\{\(\) => setConfirmDelete\(true\)\}/);
    assert.match(
      menu,
      /onConfirm=\{\(\) => \{\s*sidebar\.deleteGroup\(team\.id\);\s*onDelete\?\.\(\);\s*\}\}/,
    );
  });
});
