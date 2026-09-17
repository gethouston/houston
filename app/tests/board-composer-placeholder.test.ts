import { ok, strictEqual } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { TFunction } from "i18next";
import { buildBoardLabels } from "../src/components/board/board-labels.ts";

/**
 * The chat composer's placeholder is the first sentence a new user reads, and
 * `ui/` is i18n-agnostic: `@houston-ai/board` only carries the English default
 * and the app is what speaks the user's language. A mount that forgets
 * `labels` silently ships English into a Spanish or Portuguese app, so every
 * AIBoard mount is checked here rather than trusted.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");
const readJson = (rel: string) => JSON.parse(read(rel));

const APP_SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return entry.endsWith(".tsx") ? [path] : [];
  });
}

test("every AIBoard mount passes translated labels", () => {
  // A JSX element opening its own line — never the `<AIBoard>` a comment names.
  const mount = /^\s*<AIBoard\b/m;
  const mounts = sourceFiles(APP_SRC).filter((path) =>
    mount.test(readFileSync(path, "utf8")),
  );
  ok(mounts.length > 0, "the app still mounts AIBoard somewhere");
  const unlabelled = mounts.filter((path) => {
    const src = readFileSync(path, "utf8");
    // Either the mount passes the bundle itself, or it spreads the shared
    // board-chat wiring, which carries `labels` for every board view.
    return !src.includes("labels={") && !src.includes("chatProps}");
  });
  strictEqual(
    unlabelled.map((path) => path.slice(APP_SRC.length + 1)).join(", "),
    "",
  );
});

for (const locale of ["en", "es", "pt"] as const) {
  test(`${locale} words the composer placeholders`, () => {
    const bundle = readJson(`../src/locales/${locale}/board.json`);
    ok(typeof bundle.composer?.placeholder === "string");
    ok(typeof bundle.composer?.followUp === "string");
  });
}

/**
 * Minimal i18next stub over a real `board.json`: resolves the namespaced keys
 * the builder asks for, and returns the key itself for anything it misses, so a
 * renamed key surfaces as a visible "board:..." string rather than silence.
 */
function bundleT(bundle: unknown): TFunction<["board", "chat"]> {
  const t = (key: string) =>
    key
      .replace(/^board:/, "")
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          typeof node === "object" && node
            ? (node as Record<string, unknown>)[part]
            : undefined,
        bundle,
      ) ?? key;
  return t as unknown as TFunction<["board", "chat"]>;
}

/**
 * The 1-on-1 Houston assistant is not a mission board: its composer asks what
 * HOUSTON should work on, never what "the AI Employee" should, so it takes the
 * assistant wording of the shared bundle rather than the board's default. The
 * hook needs React, so its pure builder is what the words are read out of.
 */
for (const locale of ["en", "es", "pt"] as const) {
  test(`${locale} gives the assistant chat its own opening question`, () => {
    const bundle = readJson(`../src/locales/${locale}/board.json`);
    const t = bundleT(bundle);
    const assistant = buildBoardLabels(t, "assistant");
    const board = buildBoardLabels(t, "board");
    strictEqual(
      assistant.composerPlaceholder,
      bundle.composer.assistantPlaceholder,
    );
    strictEqual(board.composerPlaceholder, bundle.composer.placeholder);
    ok(
      assistant.composerPlaceholder !== board.composerPlaceholder,
      "the assistant says something the mission board does not",
    );
    // Only the opening question differs; a follow-up is a follow-up anywhere.
    strictEqual(assistant.followUpPlaceholder, bundle.composer.followUp);
    strictEqual(board.followUpPlaceholder, bundle.composer.followUp);
  });
}

test("a board view that names no surface gets the board's wording", () => {
  const bundle = readJson("../src/locales/en/board.json");
  strictEqual(
    buildBoardLabels(bundleT(bundle)).composerPlaceholder,
    bundle.composer.placeholder,
  );
});

for (const locale of ["en", "es", "pt"] as const) {
  test(`${locale} words the assistant placeholder without the board's`, () => {
    const bundle = readJson(`../src/locales/${locale}/board.json`);
    const assistant = bundle.composer?.assistantPlaceholder;
    ok(typeof assistant === "string" && assistant.length > 0);
    for (const employee of [
      "ai employee",
      "empleado de ia",
      "funcionário de ia",
    ]) {
      ok(
        !assistant.toLowerCase().includes(employee),
        `${locale} assistant placeholder still says "${employee}"`,
      );
    }
  });
}
