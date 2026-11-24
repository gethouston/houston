import { describe, expect, it } from "vitest";
import { scan } from "./support.ts";

const roles = (file: string, lines: readonly string[]): string[] =>
  scan(file, lines).map((comment) => comment.role);

describe("public API doc comments", () => {
  it.each([
    "ui/core/src/button.tsx",
    "packages/sdk/src/modules/turns/index.ts",
  ])("allows JSDoc on exported declarations in %s", (file) => {
    expect(
      roles(file, [
        "/** Renders the board. */",
        "export function Board() {}",
        "/** Board props. */",
        "export interface BoardProps {",
        "  /** Shown when the board is empty. */",
        "  emptyLabel?: string;",
        "  nested: {",
        "    /** Fires once per drop. */",
        "    onDrop(): void;",
        "  };",
        "}",
        "/** A card id. */",
        "export type CardId = string;",
        "/** The default gap. */",
        "export const GAP = 4;",
        "export class Store {",
        "  /** Reads one card. */",
        "  read(): void {}",
        "}",
      ]),
    ).toEqual(["doc", "doc", "doc", "doc", "doc", "doc", "doc"]);
  });

  it("allows JSDoc on a declaration exported by name", () => {
    expect(
      roles("ui/core/src/button.tsx", [
        "/** A button. */",
        "function Button() {}",
        "/** Not exported. */",
        "function inner() {}",
        "export { Button };",
      ]),
    ).toEqual(["doc", "prose"]);
  });

  it.each([
    ["an internal helper", ["/** Helper. */", "function helper() {}"]],
    ["a line comment", ["// Renders it.", "export function Board() {}"]],
    ["a plain block", ["/* Renders it. */", "export function Board() {}"]],
    [
      "a private member",
      [
        "export class Store {",
        "  /** Internal cache. */",
        "  private cache = 1;",
        "}",
      ],
    ],
    [
      "a comment inside a function body",
      ["export function Board() {", "  /** Inner. */", "  return 1;", "}"],
    ],
  ])("counts %s as prose", (_, lines) => {
    expect(roles("ui/core/src/board.tsx", lines)).toEqual(["prose"]);
  });

  it.each([
    "app/src/components/board.tsx",
    "ui/showcase/src/specimens/board.tsx",
    "packages/host/src/server.ts",
    "ui/core/tests/board.test.tsx",
    "packages/sdk/src/modules/turns/turn-vm.test.ts",
  ])("counts exported JSDoc in %s as prose", (file) => {
    expect(
      roles(file, ["/** Renders the board. */", "export function Board() {}"]),
    ).toEqual(["prose"]);
  });
});
