import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearInflightMarker,
  inflightDir,
  listInflightMarkers,
  noteInflightTool,
  readInflightMarker,
  writeInflightMarker,
} from "./turn-inflight-marker";

const fresh = () => mkdtempSync(join(tmpdir(), "houston-inflight-"));

describe("turn in-flight marker", () => {
  it("round-trips a marker and clears it", () => {
    const dataDir = fresh();
    writeInflightMarker(dataDir, {
      conversationId: "chat/one",
      turnId: "t-1",
      startedAt: 1_000,
      fenced: true,
    });
    expect(readInflightMarker(dataDir, "chat/one")).toEqual({
      conversationId: "chat/one",
      turnId: "t-1",
      startedAt: 1_000,
      fenced: true,
    });
    // The id is encoded into the file name (a slash must not nest a dir).
    expect(readdirSync(inflightDir(dataDir))).toEqual(["chat%2Fone.json"]);
    clearInflightMarker(dataDir, "chat/one");
    expect(readInflightMarker(dataDir, "chat/one")).toBeNull();
    expect(listInflightMarkers(dataDir)).toEqual([]);
  });

  it("clearing a marker that never existed is a no-op", () => {
    const dataDir = fresh();
    expect(() => clearInflightMarker(dataDir, "nope")).not.toThrow();
    expect(existsSync(inflightDir(dataDir))).toBe(false);
  });

  it("records the running tool, and never resurrects a cleared marker", () => {
    const dataDir = fresh();
    writeInflightMarker(dataDir, {
      conversationId: "c",
      turnId: "t",
      startedAt: 5,
      fenced: false,
    });
    noteInflightTool(dataDir, "c", "bash");
    expect(readInflightMarker(dataDir, "c")?.tool).toBe("bash");
    // A tool_end frame racing the turn's end: the marker is already gone, and
    // the late tool note must not bring the turn back as in-flight.
    clearInflightMarker(dataDir, "c");
    noteInflightTool(dataDir, "c", "bash");
    expect(readInflightMarker(dataDir, "c")).toBeNull();
  });

  it("lists every valid marker and drops unparseable files from disk", () => {
    const dataDir = fresh();
    writeInflightMarker(dataDir, {
      conversationId: "b",
      turnId: "t-b",
      startedAt: 2,
      fenced: false,
    });
    writeInflightMarker(dataDir, {
      conversationId: "a",
      turnId: "t-a",
      startedAt: 1,
      tool: "Bash",
      fenced: true,
    });
    writeFileSync(join(inflightDir(dataDir), "junk.json"), "{not json");
    writeFileSync(
      join(inflightDir(dataDir), "shape.json"),
      JSON.stringify({ conversationId: 1 }),
    );
    writeFileSync(join(inflightDir(dataDir), "notes.txt"), "ignored");
    expect(listInflightMarkers(dataDir)).toEqual([
      {
        conversationId: "a",
        turnId: "t-a",
        startedAt: 1,
        tool: "Bash",
        fenced: true,
      },
      { conversationId: "b", turnId: "t-b", startedAt: 2, fenced: false },
    ]);
    expect(readdirSync(inflightDir(dataDir)).sort()).toEqual([
      "a.json",
      "b.json",
      "notes.txt",
    ]);
  });

  it("an absent directory lists as empty", () => {
    expect(listInflightMarkers(fresh())).toEqual([]);
  });
});
