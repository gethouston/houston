import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  FILE_PATH_ATTR,
  fileLinkRehypePlugin,
  markdownFilePath,
} from "../src/file-link-rehype.ts";
import { extensionOf, fileNameOf } from "../src/file-path.ts";

describe("markdownFilePath", () => {
  it("decodes the percent-escapes micromark minted for a destination", () => {
    assert.equal(
      markdownFilePath("Tropical%20Food%20-%20Plan.md"),
      "Tropical Food - Plan.md",
    );
    assert.equal(markdownFilePath("informe%20caf%C3%A9.md"), "informe café.md");
  });

  it("keeps whatever prefix the agent wrote", () => {
    assert.equal(markdownFilePath("perfil.md"), "perfil.md");
    assert.equal(markdownFilePath("./out/report.pdf"), "./out/report.pdf");
    assert.equal(markdownFilePath("../shared/a.md"), "../shared/a.md");
    // An engine-absolute path must survive intact for the app to strip roots.
    assert.equal(
      markdownFilePath("/Users/jo/.houston/workspaces/W/A/perfil.md"),
      "/Users/jo/.houston/workspaces/W/A/perfil.md",
    );
  });

  it("is not a file path when the destination is a URL", () => {
    assert.equal(markdownFilePath("https://example.com/a"), null);
    assert.equal(markdownFilePath("mailto:jo@example.com"), null);
    assert.equal(markdownFilePath("houston://agent/1"), null);
    assert.equal(markdownFilePath("//cdn.example.com/a.js"), null);
  });

  it("is not a file path for in-page anchors or bare queries", () => {
    assert.equal(markdownFilePath("#fases"), null);
    assert.equal(markdownFilePath("?q=1"), null);
    assert.equal(markdownFilePath("   "), null);
  });

  it("leaves malformed escapes alone rather than throwing", () => {
    assert.equal(markdownFilePath("100%.md"), "100%.md");
    assert.equal(markdownFilePath("a%2.md"), "a%2.md");
  });
});

/** A minimal hast tree holding one anchor. */
function tree(href: string) {
  return {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "a",
            properties: { href },
            children: [{ type: "text", value: "L" }],
          },
        ],
      },
    ],
  };
}

function anchorOf(t: ReturnType<typeof tree>) {
  return t.children[0].children[0] as {
    properties: Record<string, unknown>;
  };
}

describe("fileLinkRehypePlugin", () => {
  const run = (href: string) => {
    const t = tree(href);
    fileLinkRehypePlugin()(t);
    return anchorOf(t).properties;
  };

  it("records the decoded path and makes a bare destination legible to harden", () => {
    // rehype-harden only recognizes `/`, `./` and `../` as relative; a bare
    // destination is BLOCKED outright, which is what turned an agent's own
    // file link into inert " [blocked]" text (PRODUCT-1231).
    const props = run("Tropical%20Food%20-%20Plan.md");
    assert.equal(props[FILE_PATH_ATTR], "Tropical Food - Plan.md");
    assert.equal(props.href, "./Tropical%20Food%20-%20Plan.md");
  });

  it("leaves an already-relative href's prefix alone", () => {
    const props = run("./out/report.pdf");
    assert.equal(props[FILE_PATH_ATTR], "./out/report.pdf");
    assert.equal(props.href, "./out/report.pdf");

    const rooted = run("/data/workspaces/W/A/a.md");
    assert.equal(rooted.href, "/data/workspaces/W/A/a.md");
  });

  it("never touches a real URL", () => {
    const props = run("https://example.com/a%20b");
    assert.equal(props[FILE_PATH_ATTR], undefined);
    assert.equal(props.href, "https://example.com/a%20b");
  });

  it("walks nested elements", () => {
    const t = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "ul",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "li",
              properties: {},
              children: [
                {
                  type: "element",
                  tagName: "a",
                  properties: { href: "plan.md" },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    fileLinkRehypePlugin()(t);
    const a = t.children[0].children[0].children[0] as {
      properties: Record<string, unknown>;
    };
    assert.equal(a.properties[FILE_PATH_ATTR], "plan.md");
    assert.equal(a.properties.href, "./plan.md");
  });
});

describe("fileNameOf / extensionOf", () => {
  it("takes the last segment on both separators", () => {
    assert.equal(fileNameOf("informes/Q3 reporte.pdf"), "Q3 reporte.pdf");
    assert.equal(fileNameOf("C:\\Users\\jo\\perfil.md"), "perfil.md");
    assert.equal(fileNameOf("perfil.md"), "perfil.md");
  });

  it("lowercases the extension and tolerates files without one", () => {
    assert.equal(extensionOf("Plan 90 Dias.MD"), "md");
    assert.equal(extensionOf("informes/costos.xlsx"), "xlsx");
    assert.equal(extensionOf("Makefile"), "");
    // A dotfile is not an extension.
    assert.equal(extensionOf(".gitignore"), "");
  });
});
