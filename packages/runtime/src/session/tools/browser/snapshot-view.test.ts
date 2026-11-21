import { describe, expect, test } from "vitest";
import { parseTree, renderTree, walk } from "./snapshot-tree";
import { FULL_VIEW, viewTree } from "./snapshot-view";

const TREE = [
  "- main [ref=e2]:",
  "  - generic [ref=e3]:",
  "    - generic [active] [ref=e4]:",
  '      - heading "Hello" [level=1] [ref=e5]',
  "      - paragraph [ref=e6]:",
  "        - text: Some text",
  '        - link "a link" [ref=e7] [cursor=pointer]:',
  "          - /url: /x?token=abc",
  '    - navigation "Main" [ref=e8]:',
  "      - list [ref=e9]:",
  "        - listitem [ref=e10]:",
  '          - link "Pricing" [ref=e11] [cursor=pointer]:',
  "            - /url: https://e.com/pricing",
  "    - generic [ref=e12]",
  "    - generic [ref=e13] [cursor=pointer]: clicky div",
  '    - button "Reveal" [ref=e14]',
  '    - combobox "Pick" [ref=e17]:',
  '      - option "One" [selected]',
].join("\n");

const view = (overrides: Partial<typeof FULL_VIEW> = {}) =>
  viewTree({
    tree: TREE,
    view: { ...FULL_VIEW, ...overrides },
    pageUrl: "https://site.test/home",
  });

describe("snapshot tree", () => {
  test("parses and re-prints a tree unchanged when everything is kept", () => {
    const roots = parseTree(TREE);
    expect(renderTree(roots, { keep: () => true })).toBe(TREE);
    expect([...walk(roots)].find((n) => n.ref === "e11")?.name).toBe("Pricing");
  });

  test("a continuation line stays with its item", () => {
    const tree =
      '- paragraph [ref=e1]: |\n  line one\n  line two\n- button "Go" [ref=e2]';
    const roots = parseTree(tree);
    expect(roots).toHaveLength(2);
    expect(renderTree(roots, { keep: () => true })).toBe(tree);
  });
});

describe("compact default", () => {
  test("drops unnamed wrappers and link addresses, promoting their children", () => {
    const { tree } = view();
    expect(tree).not.toMatch(/- generic \[(?:active\] \[)?ref=e[34]\]/);
    expect(tree).not.toContain("[ref=e12]");
    expect(tree).not.toContain("/url");
    expect(tree).toContain("- generic [ref=e13] [cursor=pointer]: clicky div");
    expect(tree).toContain('\n  - heading "Hello" [level=1] [ref=e5]');
    expect(tree).toContain('- link "Pricing" [ref=e11] [cursor=pointer]\n');
  });

  test("links keeps each address, absolute and redacted", () => {
    const { tree } = view({ links: true });
    expect(tree).toContain("/url: https://site.test/x?token=[hidden]");
    expect(tree).toContain("/url: https://e.com/pricing");
  });
});

describe("interactive", () => {
  test("keeps controls, headings and the named sections holding them", () => {
    const { tree } = view({ interactive: true });
    const lines = tree.split("\n").map((l) => l.trim());
    expect(lines).toEqual([
      '- heading "Hello" [level=1] [ref=e5]',
      '- link "a link" [ref=e7] [cursor=pointer]',
      '- navigation "Main" [ref=e8]:',
      '- link "Pricing" [ref=e11] [cursor=pointer]',
      "- generic [ref=e13] [cursor=pointer]: clicky div",
      '- button "Reveal" [ref=e14]',
      '- combobox "Pick" [ref=e17]:',
      '- option "One" [selected]',
    ]);
    expect(tree).toContain('- navigation "Main" [ref=e8]:\n  - link "Pricing"');
  });
});

describe("query", () => {
  test("returns matching lines with their context and a count", () => {
    const { tree, notes } = view({ query: "PRICING" });
    expect(notes).toEqual(['1 line matches "PRICING".']);
    expect(tree).toBe(
      [
        '- navigation "Main" [ref=e8]:',
        "  - list [ref=e9]:",
        "    - listitem [ref=e10]:",
        '      - link "Pricing" [ref=e11] [cursor=pointer]',
      ].join("\n"),
    );
  });

  test("context skips the unnamed wrappers the compact view drops", () => {
    const { tree } = view({ query: "some text" });
    expect(tree).toBe(
      [
        "- main [ref=e2]:",
        "  - paragraph [ref=e6]:",
        "    - text: Some text",
      ].join("\n"),
    );
  });

  test("a query matches no ref, and says so when nothing matches", () => {
    const { tree, notes } = view({ query: "e11" });
    expect(tree).toBe("");
    expect(notes[0]).toContain('Nothing on the page matches "e11"');
  });

  test("with links, a matched link keeps its address", () => {
    const { tree } = view({ query: "pricing", links: true });
    expect(tree).toContain("/url: https://e.com/pricing");
  });
});

describe("what changed", () => {
  test("marks elements the previous look did not have, and counts them", () => {
    const first = view();
    const revealed = TREE.replace(
      '    - button "Reveal" [ref=e14]',
      '    - button "Reveal" [ref=e14]\n    - generic [ref=e18]:\n      - button "New one" [ref=e19]\n      - paragraph [ref=e20]: new para',
    );
    const second = viewTree({
      tree: revealed,
      view: FULL_VIEW,
      pageUrl: "https://site.test/home",
      previous: first.refs,
    });
    expect(second.notes).toEqual(["2 new since the last look, marked [new]."]);
    expect(second.tree).toContain('- button "New one" [ref=e19] [new]');
    expect(second.tree).toContain("- paragraph [ref=e20] [new]: new para");
    expect(second.tree).not.toContain('"Reveal" [ref=e14] [new]');
  });

  test("a name spelling out another ref never stands in for the element's own", () => {
    const spoof = '- button "Keep [ref=e7]" [ref=e3]: Keep';
    const [node] = parseTree(spoof);
    expect(node?.ref).toBe("e3");
    const marked = viewTree({
      tree: spoof,
      view: FULL_VIEW,
      pageUrl: "https://site.test/home",
      previous: new Set(),
    });
    expect(marked.tree).toBe('- button "Keep [ref=e7]" [ref=e3] [new]: Keep');
  });

  test("a first look marks nothing", () => {
    expect(view().notes).toEqual([]);
    expect(view().tree).not.toContain("[new]");
  });
});
