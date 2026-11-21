import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  fileReadRefusal,
  surfaceFileReadRefusal,
} from "../src/lib/file-gone.ts";
import en from "../src/locales/en/agents.json" with { type: "json" };
import { useUIStore } from "../src/stores/ui.ts";

/**
 * A workspace-file read the host refuses in a way the person can understand
 * is their state, never a Houston bug: `404 file not found` (PRODUCT-1780,
 * HOUSTON-APP-53E: the agent linked a file that is not there), and the typed
 * `400 outside_workspace` (HOUSTON-APP-5HK: the agent linked a path outside
 * its files). Every other refusal stays loud.
 */

const outside = (body: unknown) =>
  Object.assign(new Error("invalid workspace path (engine error 400)"), {
    status: 400,
    body,
  });

const OUTSIDE_BODY = {
  error:
    "invalid workspace path: /work/houston-turn-0123456789abcdef/store/custom-integrations.json",
  code: "outside_workspace",
};

describe("fileReadRefusal", () => {
  it("names the engine adapter's 404 for a missing workspace file", () => {
    const err = Object.assign(new Error("file not found (engine error 404)"), {
      status: 404,
      body: { error: "file not found" },
    });
    assert.equal(fileReadRefusal(err), "file_gone");
    assert.equal(fileReadRefusal({ status: 404 }), "file_gone");
  });

  it("names the host's typed 400 for a path outside the agent's files", () => {
    assert.equal(fileReadRefusal(outside(OUTSIDE_BODY)), "outside_workspace");
  });

  it("names an older gateway's uncoded 400 for a sleeping agent", () => {
    assert.equal(
      fileReadRefusal(outside({ error: OUTSIDE_BODY.error })),
      "outside_workspace",
    );
  });

  it("keeps an empty path or another 400 loud", () => {
    assert.equal(
      fileReadRefusal(outside({ error: "invalid workspace path: " })),
      null,
    );
    assert.equal(fileReadRefusal(outside({ error: "missing path" })), null);
  });

  it("never matches other statuses or shapeless throws", () => {
    for (const status of [400, 403, 500, 502, 503, "404"]) {
      assert.equal(fileReadRefusal({ status }), null);
    }
    assert.equal(fileReadRefusal(undefined), null);
    assert.equal(fileReadRefusal("file not found"), null);
    assert.equal(fileReadRefusal(new Error("boom")), null);
  });
});

describe("surfaceFileReadRefusal", () => {
  const reports: string[] = [];
  const report = (kind: "outside_workspace") => void reports.push(kind);
  afterEach(() => {
    reports.length = 0;
    for (const t of useUIStore.getState().toasts)
      useUIStore.getState().dismissToast(t.id);
  });

  it("reports an outside-workspace link quietly and toasts its own copy", () => {
    const refusal = surfaceFileReadRefusal(
      outside(OUTSIDE_BODY),
      "download_project_file",
      { agentPath: "Personal/Bob" },
      true,
      report,
    );
    assert.equal(refusal, "outside_workspace");
    assert.deepEqual(reports, ["outside_workspace"]);
    const [toast] = useUIStore.getState().toasts;
    assert.equal(toast?.variant, "info");
    // The shared test process runs files in random order, so i18n may hold
    // the agents namespace, only its init, or nothing: the title is the en
    // copy or the key with or without its namespace. Each is this refusal's
    // copy, never the gone file's.
    assert.ok(
      [
        en.files.outsideWorkspace.title,
        "agents:files.outsideWorkspace.title",
        "files.outsideWorkspace.title",
      ].includes(toast?.title ?? ""),
    );
  });

  it("reports even when the caller renders the copy inline", () => {
    surfaceFileReadRefusal(
      outside(OUTSIDE_BODY),
      "download_project_file",
      {},
      false,
      report,
    );
    assert.deepEqual(reports, ["outside_workspace"]);
    assert.equal(useUIStore.getState().toasts.length, 0);
  });

  it("a gone file toasts without a report; a fault does neither", () => {
    assert.equal(
      surfaceFileReadRefusal({ status: 404 }, "x", {}, true, report),
      "file_gone",
    );
    assert.equal(reports.length, 0);
    assert.equal(useUIStore.getState().toasts.length, 1);
    assert.equal(
      surfaceFileReadRefusal({ status: 500 }, "x", {}, true, report),
      null,
    );
    assert.equal(reports.length, 0);
    assert.equal(useUIStore.getState().toasts.length, 1);
  });
});

describe("file read refusal copy", () => {
  for (const locale of ["en", "es", "pt"] as const) {
    it(`${locale} has authored title + description`, () => {
      const agents = JSON.parse(
        readFileSync(
          join(import.meta.dirname, `../src/locales/${locale}/agents.json`),
          "utf8",
        ),
      ) as { files?: Record<string, Record<string, unknown> | undefined> };
      for (const group of ["gone", "outsideWorkspace"]) {
        for (const key of ["title", "description"]) {
          const text = agents.files?.[group]?.[key];
          assert.equal(typeof text, "string", `${group}.${key}`);
          assert.ok((text as string).length > 0);
          assert.ok(!/engine error|404|400|—/i.test(text as string));
        }
      }
    });
  }
});
