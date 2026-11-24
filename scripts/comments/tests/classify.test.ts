import { describe, expect, it } from "vitest";
import { scanSource } from "../scan.ts";
import { scan } from "./support.ts";

const toolingFor = (file: string, comment: string): boolean => {
  const [found] = scan(file, [comment, "export const x = 1;"]);
  return found.role === "tooling";
};

describe("tooling classification", () => {
  it.each([
    ["a.ts", "/** Lists agents.\n * @assistant group:agents\n */"],
    ["a.ts", "/** @assistant group:files hidden: returns a secret */"],
    ["a.ts", "// biome-ignore lint/suspicious/noExplicitAny: wire shape"],
    ["a.ts", "// biome-ignore-all lint/style: generated"],
    ["a.ts", "// @ts-expect-error the fake has no type"],
    ["a.ts", "// @ts-ignore"],
    ["a.ts", "// @ts-nocheck"],
    ["a.mjs", "// @ts-check"],
    ["a.ts", "// eslint-disable-next-line no-console"],
    ["a.ts", "/* eslint-disable */"],
    ["a.ts", '/// <reference types="vite/client" />'],
    ["a.ts", "/* @vite-ignore */"],
    ["a.ts", '/* webpackChunkName: "x" */'],
    ["a.ts", "/* #__PURE__ */"],
    ["a.ts", "/* @__PURE__ */"],
    ["a.ts", "/* @__NO_SIDE_EFFECTS__ */"],
    ["a.ts", "// @vitest-environment jsdom"],
    ["a.tsx", "/** @jsxImportSource preact */"],
    ["a.tsx", "/** @jsx h */"],
    ["a.tsx", "/** @jsxRuntime classic */"],
    ["a.ts", "// prettier-ignore"],
    ["a.ts", "/* c8 ignore next */"],
    ["a.ts", "/* v8 ignore start */"],
    ["a.ts", "/* istanbul ignore next */"],
    ["a.js", "//# sourceMappingURL=a.js.map"],
    ["a.ts", "/** @license MIT */"],
    ["a.ts", "// SPDX-License-Identifier: MIT"],
    ["a.ts", "/*! keep me */"],
    ["a.js", "/** @type {import('x').Y} */"],
    ["a.mjs", "/** Build.\n * @param {string} name\n */"],
    ["a.cjs", "/** @returns {number} */"],
    ["a.mjs", "/** @typedef {{ a: number }} A */"],
    ["a.mjs", "/** @template T */"],
    ["a.mjs", "/** @satisfies {X} */"],
    ["a.mjs", '/** @import { A } from "./a.ts" */'],
    ["a.mjs", "/** @callback Done */"],
    ["a.ts", "/** @deprecated use `b` instead */"],
    ["a.tsx", "/** Old name.\n * @deprecated pass `labels.x` instead\n */"],
  ])("%s keeps %j", (file, comment) => {
    expect(toolingFor(file, comment)).toBe(true);
  });

  it.each([
    ["a.ts", "// Explains why the retry waits."],
    ["a.ts", "// The test uses @ts-expect-error below."],
    ["a.ts", "/// Not a directive."],
    ["a.ts", "/** Builds it.\n * @param {string} name the name\n */"],
    ["a.ts", "/** Mentions an `@assistant` tag in prose. */"],
    ["a.mjs", "/** Plain prose block. */"],
    ["a.ts", "/* A sentence. */"],
    ["a.ts", "/* @deprecated outside JSDoc */"],
    ["a.ts", "/** Mentions @deprecated mid-line. */"],
  ])("%s counts %j as prose", (file, comment) => {
    expect(toolingFor(file, comment)).toBe(false);
  });

  it("keeps a pinned comment", () => {
    const pinned = [
      { path: "a.ts", startsWith: "// ─── Marker", reason: "test anchor" },
    ];
    const [found] = scanSource(
      "a.ts",
      "// ─── Marker ───\nconst a = 1;\n",
      pinned,
    );
    expect(found.role).toBe("tooling");
  });

  it.each([
    ["//! crate docs", true],
    ["/// item docs", true],
    ["//// plain", false],
    ["/** block docs */", true],
    ["/*! inner block docs */", true],
    ["/**/", false],
    ["/*** plain */", false],
    ["// plain", false],
    ["// SAFETY: the pointer outlives the call", true],
    ["/* SAFETY: the buffer is live */", true],
    ["// The SAFETY: note sits mid-line", false],
  ])("Rust %j is tooling: %s", (comment, tooling) => {
    expect(scan("a.rs", [comment, "fn a() {}"])[0].role === "tooling").toBe(
      tooling,
    );
  });

  it("reads a Rust SAFETY justification and its continuation as one tooling comment", () => {
    const found = scan("a.rs", [
      "fn a() {",
      "    // Prose before it.",
      "    // SAFETY: `setpgid(0, 0)` touches no Rust state;",
      "    // the child has not exec'd yet.",
      "    unsafe { f() };",
      "    // Prose after it.",
      "}",
    ]);
    expect(found.map((c) => [c.line, c.endLine, c.role === "tooling"])).toEqual(
      [
        [2, 2, false],
        [3, 4, true],
        [6, 6, false],
      ],
    );
  });

  it("keeps shellcheck directives and CSS license blocks", () => {
    expect(
      scan("a.sh", ["# shellcheck disable=SC2086", "echo $a"])[0].role ===
        "tooling",
    ).toBe(true);
    expect(scan("a.sh", ["# plain", "echo"])[0].role === "tooling").toBe(false);
    expect(
      scan("a.css", ["/*! license */", "a {}"])[0].role === "tooling",
    ).toBe(true);
    expect(
      scan("a.css", ["/* biome-ignore lint: x */", "a {}"])[0].role ===
        "tooling",
    ).toBe(true);
    expect(scan("a.css", ["/* plain */", "a {}"])[0].role === "tooling").toBe(
      false,
    );
  });
});
