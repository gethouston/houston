import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  buildWorkspaceContextSection,
  USER_MD,
  WORKSPACE_MD,
} from "./workspace-context";

/**
 * WORKSPACE.md + USER.md are appended to every chat's system prompt. Ported from
 * the removed Rust engine's `workspace_context` tests (HOU-711): the section is
 * always present for a real workspace (empty markers when the files are blank),
 * carries filled content when written, and is skipped for a dir that is not a
 * real workspace.
 */

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
  // The absolute file paths tell the agent where to write updates.
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
  // Whitespace-only content is treated as empty too.
  writeFileSync(join(dir, WORKSPACE_MD), "   \n  ");
  expect(buildWorkspaceContextSection(dir)).toContain("(empty so far");
});

test("a filled workspace slot keeps its empty-marker user slot", () => {
  const dir = freshWorkspace();
  writeFileSync(join(dir, WORKSPACE_MD), "Acme Corp.");

  const out = buildWorkspaceContextSection(dir) ?? "";
  expect(out).toContain("Acme Corp.");
  // The user slot, still blank, keeps its guidance marker.
  expect(out).toContain("role, goals");
});

test("returns null outside a real workspace (no .houston dir)", () => {
  const dir = freshWorkspace(false);
  // Even with content present, a non-workspace dir is not annotated.
  writeFileSync(join(dir, WORKSPACE_MD), "stray file");
  expect(buildWorkspaceContextSection(dir)).toBeNull();
});
