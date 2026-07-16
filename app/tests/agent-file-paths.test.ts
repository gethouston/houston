import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
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
