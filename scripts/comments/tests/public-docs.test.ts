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
    ).toEqual(["doc", "doc", "doc", "prose", "doc", "doc", "doc"]);
  });

  it("allows JSDoc above tooling directives", () => {
    expect(
      roles("ui/core/src/board.tsx", [
        "/** Renders the board. */",
        "// biome-ignore lint/style/noDefaultExport: the router loads it",
        "// oxlint-disable-next-line no-default-export",
        "export function Board() {}",
        "/** A wire shape. */",
        "// @ts-expect-error the fake has no type",
        "export const shape = 1;",
      ]),
    ).toEqual(["doc", "tooling", "doc", "tooling"]);
  });

  it.each([
    [
      "a default function",
      ["/** The board. */", "export default function Board() {}"],
    ],
    ["a default class", ["/** The store. */", "export default class Store {}"]],
    ["a default object", ["/** The config. */", "export default { gap: 4 };"]],
    [
      "a declaration exported as default",
      ["/** The board. */", "function Board() {}", "export default Board;"],
    ],
  ])("allows JSDoc on %s", (_, lines) => {
    expect(roles("ui/core/src/board.tsx", lines)).toEqual(["doc"]);
  });

  it.each([
    [
      "a module header above the first export",
      ["/** The board module. */", "", "export function Board() {}"],
    ],
    [
      "a doc split from a directive by a blank line",
      [
        "/** The board. */",
        "",
        "// biome-ignore lint: x",
        "export function Board() {}",
      ],
    ],
    [
      "a doc above prose above the export",
      ["/** The board. */", "// Prose.", "export function Board() {}"],
    ],
    [
      "a member of a nested type literal",
      [
        "export type Props = {",
        "  tabs: {",
        "    /** Muted. */",
        "    disabled?: boolean;",
        "  }[];",
        "};",
      ],
    ],
  ])("counts %s as prose", (_, lines) => {
    expect(
      scan("ui/core/src/board.tsx", lines)
        .filter((comment) => comment.text.startsWith("/**"))
        .map((comment) => comment.role),
    ).toEqual(["prose"]);
  });

  it("allows JSDoc on members of a type alias union of literals", () => {
    expect(
      roles("ui/core/src/board.tsx", [
        "export type Event =",
        "  | {",
        "      /** The kind. */",
        "      type: 'a';",
        "    }",
        "  | ({",
        "      /** The id. */",
        "      id: string;",
        "    } & {",
        "      /** The name. */",
        "      name: string;",
        "    });",
      ]),
    ).toEqual(["doc", "doc", "doc"]);
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
