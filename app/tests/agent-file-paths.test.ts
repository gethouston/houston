import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  decodeMarkdownHref,
  fileNameOf,
  toWorkspaceRelative,
} from "../src/lib/agent-file-paths.ts";

// The TS engine's folderPath is a route key (`Workspace/Agent`); the legacy
// engine's is the real absolute directory.
const TS_ENGINE = { folderPath: "Personal/Assistant" };
const TS_ENGINE_LOCAL = {
  folderPath: "Personal/Assistant",
  localDir: "/Users/jo/.houston/workspaces/Personal/Assistant",
};
const LEGACY = { folderPath: "/Users/jo/Documents/Houston/Personal/Assistant" };

describe("toWorkspaceRelative", () => {
  it("passes workspace-relative paths through unchanged", () => {
    strictEqual(
      toWorkspaceRelative("out/report.pdf", TS_ENGINE),
      "out/report.pdf",
    );
    strictEqual(toWorkspaceRelative("perfil.md", TS_ENGINE), "perfil.md");
  });

  it("strips ./ prefixes from prose paths", () => {
    strictEqual(toWorkspaceRelative("./report.pdf", TS_ENGINE), "report.pdf");
    strictEqual(
      toWorkspaceRelative("./out/report.pdf", TS_ENGINE),
      "out/report.pdf",
    );
  });

  it("strips the host-reported localDir prefix", () => {
    strictEqual(
      toWorkspaceRelative(
        "/Users/jo/.houston/workspaces/Personal/Assistant/out/report.pdf",
        TS_ENGINE_LOCAL,
      ),
      "out/report.pdf",
    );
  });

  it("strips through the route key inside a macOS absolute path", () => {
    strictEqual(
      toWorkspaceRelative(
        "/Users/jo/.houston/workspaces/Personal/Assistant/perfil.md",
        TS_ENGINE,
      ),
      "perfil.md",
    );
  });

  it("strips through the route key inside a cloud pod path", () => {
    strictEqual(
      toWorkspaceRelative(
        "/data/workspaces/Personal/Assistant/out/report.pdf",
        TS_ENGINE,
      ),
      "out/report.pdf",
    );
  });

  it("strips through the route key inside a Windows absolute path", () => {
    strictEqual(
      toWorkspaceRelative(
        "C:\\Users\\jo\\.houston\\workspaces\\Personal\\Assistant\\docs\\perfil.md",
        TS_ENGINE,
      ),
      "docs/perfil.md",
    );
  });

  it("strips the legacy engine's absolute folderPath prefix", () => {
    strictEqual(
      toWorkspaceRelative(
        "/Users/jo/Documents/Houston/Personal/Assistant/report.pdf",
        LEGACY,
      ),
      "report.pdf",
    );
  });

  it("returns an unmatchable absolute path as-is (host rejects it visibly)", () => {
    strictEqual(
      toWorkspaceRelative("/tmp/elsewhere/report.pdf", TS_ENGINE),
      "/tmp/elsewhere/report.pdf",
    );
  });

  it("ignores a trailing slash on the configured roots", () => {
    strictEqual(
      toWorkspaceRelative("/data/workspaces/Personal/Assistant/a.md", {
        folderPath: "Personal/Assistant/",
      }),
      "a.md",
    );
  });
});

describe("fileNameOf", () => {
  it("takes the last segment on both separators", () => {
    strictEqual(fileNameOf("out/report.pdf"), "report.pdf");
    strictEqual(fileNameOf("C:\\Users\\jo\\perfil.md"), "perfil.md");
    strictEqual(fileNameOf("perfil.md"), "perfil.md");
  });
});

// PRODUCT-1231: micromark normalizes every markdown link destination through
// `normalizeUri`, so the href React sees is percent-encoded. Undoing that is
// what makes a file with a space or an accent in its name previewable at all.
describe("decodeMarkdownHref", () => {
  it("decodes the spaces micromark escaped in a destination", () => {
    strictEqual(
      decodeMarkdownHref("Tropical%20Food%20-%20Estrategia%2090%20Dias.md"),
      "Tropical Food - Estrategia 90 Dias.md",
    );
  });

  it("decodes non-ASCII names", () => {
    strictEqual(
      decodeMarkdownHref("informe%20caf%C3%A9.md"),
      "informe café.md",
    );
    strictEqual(
      decodeMarkdownHref("docs/plan%20a%C3%B1o.md"),
      "docs/plan año.md",
    );
  });

  it("leaves a path with nothing to decode untouched", () => {
    strictEqual(decodeMarkdownHref("perfil.md"), "perfil.md");
    strictEqual(decodeMarkdownHref("./out/report.pdf"), "./out/report.pdf");
  });

  it("leaves malformed escapes alone rather than throwing", () => {
    // A file genuinely named "100%.md", and a stray trailing escape.
    strictEqual(decodeMarkdownHref("100%.md"), "100%.md");
    strictEqual(decodeMarkdownHref("a%2.md"), "a%2.md");
    strictEqual(decodeMarkdownHref("bad%E0%A4%A.md"), "bad%E0%A4%A.md");
  });

  it("does not treat + as a space (that is form encoding, not URI)", () => {
    strictEqual(decodeMarkdownHref("q1+q2%20plan.md"), "q1+q2 plan.md");
  });
});
