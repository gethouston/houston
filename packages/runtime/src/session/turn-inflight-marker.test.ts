import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
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

  it("round-trips the resume payload and the resumed-turn id (PRODUCT-1785)", () => {
    const dataDir = fresh();
    writeInflightMarker(dataDir, {
      conversationId: "c",
      turnId: "t-2",
      startedAt: 7,
      fenced: false,
      resume: {
        pin: { provider: "anthropic", model: "opus", mode: "plan" },
        acting: { credentialScopeKey: "u:sub-1" },
      },
      resumeOf: "t-1",
    });
    expect(readInflightMarker(dataDir, "c")).toEqual({
      conversationId: "c",
      turnId: "t-2",
      startedAt: 7,
      fenced: false,
      resume: {
        pin: { provider: "anthropic", model: "opus", mode: "plan" },
        acting: { credentialScopeKey: "u:sub-1" },
      },
      resumeOf: "t-1",
    });
  });

  it("an empty resume payload survives — its PRESENCE is what says the turn can be resumed", () => {
    const dataDir = fresh();
    writeInflightMarker(dataDir, {
      conversationId: "d",
      turnId: "t",
      startedAt: 0,
      fenced: false,
      resume: {},
    });
    expect(readInflightMarker(dataDir, "d")?.resume).toEqual({});
  });

  it("junk resume fields are dropped and the marker stays valid", () => {
    const dataDir = fresh();
    mkdirSync(inflightDir(dataDir), { recursive: true });
    writeFileSync(
      join(inflightDir(dataDir), "e.json"),
      JSON.stringify({
        conversationId: "e",
        turnId: "t",
        startedAt: 0,
        fenced: false,
        resume: { pin: { provider: 7, mode: "sideways" }, acting: 5 },
        resumeOf: 9,
      }),
    );
    expect(readInflightMarker(dataDir, "e")).toEqual({
      conversationId: "e",
      turnId: "t",
      startedAt: 0,
      fenced: false,
      resume: {},
    });
  });

  it("a marker with no resume payload reads without one (older engine)", () => {
    const dataDir = fresh();
    writeInflightMarker(dataDir, {
      conversationId: "f",
      turnId: "t",
      startedAt: 0,
      fenced: false,
    });
    expect(readInflightMarker(dataDir, "f")?.resume).toBeUndefined();
  });
});
