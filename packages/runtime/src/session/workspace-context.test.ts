import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  buildWorkspaceContextSection,
  USER_MD,
  WORKSPACE_MD,
} from "./workspace-context";

function freshWorkspace(withHouston = true): string {
  const dir = mkdtempSync(join(tmpdir(), "houston-wsctx-"));
  if (withHouston) mkdirSync(join(dir, ".houston"), { recursive: true });
  return dir;
}

test("filled content appears under both headings", () => {
  const dir = freshWorkspace();
  writeFileSync(join(dir, WORKSPACE_MD), "Acme Corp, B2B fintech.");
  writeFileSync(join(dir, USER_MD), "Juan, sales lead.");

  const out = buildWorkspaceContextSection(dir);
  expect(out).not.toBeNull();
  expect(out).toContain("# Workspace Context");
  expect(out).toContain("Acme Corp, B2B fintech.");
  expect(out).toContain("# User Context");
  expect(out).toContain("Juan, sales lead.");
  expect(out).toContain(join(dir, WORKSPACE_MD));
  expect(out).toContain(join(dir, USER_MD));
});

test("empty / missing files still render the section with empty markers", () => {
  const dir = freshWorkspace();

  const out = buildWorkspaceContextSection(dir);
  expect(out).not.toBeNull();
  expect(out).toContain("# Workspace Context");
  expect(out).toContain("# User Context");
  expect(out).toContain("(empty so far");
  writeFileSync(join(dir, WORKSPACE_MD), "   \n  ");
  expect(buildWorkspaceContextSection(dir)).toContain("(empty so far");
});

test("a filled workspace slot keeps its empty-marker user slot", () => {
  const dir = freshWorkspace();
  writeFileSync(join(dir, WORKSPACE_MD), "Acme Corp.");

  const out = buildWorkspaceContextSection(dir) ?? "";
  expect(out).toContain("Acme Corp.");
  expect(out).toContain("role, goals");
});

test("returns null outside a real workspace (no .houston dir)", () => {
  const dir = freshWorkspace(false);
  writeFileSync(join(dir, WORKSPACE_MD), "stray file");
  expect(buildWorkspaceContextSection(dir)).toBeNull();
});

test("provided (cloud) content wins over the volume and drops file guidance", () => {
  const dir = freshWorkspace();
  writeFileSync(join(dir, WORKSPACE_MD), "FROM FILE — must be ignored");

  const out = buildWorkspaceContextSection(dir, {
    workspace: "Acme Corp.",
    user: "Bob, sales lead.",
  });
  expect(out).not.toBeNull();
  expect(out).toContain("Acme Corp.");
  expect(out).toContain("Bob, sales lead.");
  expect(out).not.toContain("FROM FILE");
  expect(out).not.toContain(WORKSPACE_MD);
  expect(out).not.toContain(USER_MD);
  expect(out).toContain("maintained by the user");
});

test("provided (cloud) with both blobs empty injects nothing", () => {
  const dir = freshWorkspace();
  expect(
    buildWorkspaceContextSection(dir, { workspace: "", user: "   " }),
  ).toBeNull();
});

test("provided (cloud) needs no .houston dir and renders a one-sided section", () => {
  const dir = freshWorkspace(false);
  const out = buildWorkspaceContextSection(dir, {
    workspace: "Acme only",
    user: "",
  });
  expect(out).not.toBeNull();
  expect(out).toContain("Acme only");
  expect(out).toContain("(none provided.)");
});
