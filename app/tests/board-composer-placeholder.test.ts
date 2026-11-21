import { ok, strictEqual } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { TFunction } from "i18next";
import { buildBoardLabels } from "../src/components/board/board-labels.ts";

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
  const mount = /^\s*<AIBoard\b/m;
  const mounts = sourceFiles(APP_SRC).filter((path) =>
    mount.test(readFileSync(path, "utf8")),
  );
  ok(mounts.length > 0, "the app still mounts AIBoard somewhere");
  const unlabelled = mounts.filter((path) => {
    const src = readFileSync(path, "utf8");
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
