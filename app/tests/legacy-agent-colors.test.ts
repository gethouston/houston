import assert from "node:assert/strict";
import test from "node:test";
import {
  type ColorStorage,
  readLegacyAgentColors,
} from "../src/lib/legacy-agent-colors.ts";

/** In-memory storage; `null` value means the key throws (storage disabled). */
function storage(items: Record<string, string | null>): ColorStorage {
  return {
    getItem(key) {
      if (!(key in items)) return null;
      const v = items[key];
      if (v === null) throw new Error("storage disabled");
      return v;
    },
  };
}

const CP_KEY = "houston.web.cp.agentColors";
const STANDALONE_KEY = "houston.web.agents";

// ── cp overlay (Record<agentId, color>) ──────────────────────────────

test("resolves a cp-overlay color by agent id", () => {
  const l = readLegacyAgentColors(
    storage({ [CP_KEY]: JSON.stringify({ "Work/Sales": "#ff0000" }) }),
  );
  assert.equal(l.colorFor("Work/Sales", "Sales"), "#ff0000");
  assert.equal(l.byId["Work/Sales"], "#ff0000");
});

test("cp overlay carries no names — no name fallback from it", () => {
  const l = readLegacyAgentColors(
    storage({ [CP_KEY]: JSON.stringify({ "Work/Sales": "#ff0000" }) }),
  );
  // A source agent whose id differs but name matches gets nothing from cp.
  assert.equal(l.colorFor("other/id", "Sales"), undefined);
});

// ── standalone store (Record<workspaceId, Agent[]>) ──────────────────

test("resolves a standalone color by id and by normalized name", () => {
  const l = readLegacyAgentColors(
    storage({
      [STANDALONE_KEY]: JSON.stringify({
        default: [
          { id: "uuid-1", name: "Sales", color: "#00ff00" },
          { id: "uuid-2", name: "  Ops Team  ", color: "#0000ff" },
        ],
      }),
    }),
  );
  assert.equal(l.colorFor("uuid-1", "Sales"), "#00ff00");
  // id miss, name fallback (trim + case-insensitive).
  assert.equal(l.colorFor("no-match", "ops team"), "#0000ff");
});

test("name fallback finds a standalone color when only the name matches", () => {
  const l = readLegacyAgentColors(
    storage({
      [STANDALONE_KEY]: JSON.stringify({
        default: [{ id: "uuid-1", name: "Sales", color: "#00ff00" }],
      }),
    }),
  );
  // Source id "<Workspace>/<Agent>" won't match a standalone UUID — name wins.
  assert.equal(l.colorFor("Work/Sales", "Sales"), "#00ff00");
});

// ── precedence + both shapes together ────────────────────────────────

test("cp overlay wins an id collision with the standalone store", () => {
  const l = readLegacyAgentColors(
    storage({
      [CP_KEY]: JSON.stringify({ "Work/Sales": "#cp0000" }),
      [STANDALONE_KEY]: JSON.stringify({
        default: [{ id: "Work/Sales", name: "Sales", color: "#5700ff" }],
      }),
    }),
  );
  assert.equal(l.colorFor("Work/Sales", "Sales"), "#cp0000");
});

test("id match beats a name match", () => {
  const l = readLegacyAgentColors(
    storage({
      [CP_KEY]: JSON.stringify({ "Work/Sales": "#byid00" }),
      [STANDALONE_KEY]: JSON.stringify({
        default: [{ id: "uuid-1", name: "Sales", color: "#byname" }],
      }),
    }),
  );
  assert.equal(l.colorFor("Work/Sales", "Sales"), "#byid00");
});

// ── robustness: missing keys, corrupt JSON, disabled storage ─────────

test("returns empty lookup when the keys are absent", () => {
  const l = readLegacyAgentColors(storage({}));
  assert.deepEqual(l.byId, {});
  assert.deepEqual(l.byName, {});
  assert.equal(l.colorFor("Work/Sales", "Sales"), undefined);
});

test("corrupt JSON in either key is ignored, not thrown", () => {
  const l = readLegacyAgentColors(
    storage({ [CP_KEY]: "{not json", [STANDALONE_KEY]: "also broken" }),
  );
  assert.equal(l.colorFor("Work/Sales", "Sales"), undefined);
});

test("survives a null/no storage handle", () => {
  const l = readLegacyAgentColors(null);
  assert.equal(l.colorFor("Work/Sales", "Sales"), undefined);
});

test("survives storage that throws on read (disabled)", () => {
  const l = readLegacyAgentColors(storage({ [CP_KEY]: null }));
  assert.equal(l.colorFor("Work/Sales", "Sales"), undefined);
});

test("ignores non-string / empty colors and malformed entries", () => {
  const l = readLegacyAgentColors(
    storage({
      [CP_KEY]: JSON.stringify({
        "Work/A": 123,
        "Work/B": "",
        "Work/C": "#ok",
      }),
      [STANDALONE_KEY]: JSON.stringify({
        default: [
          "not-an-object",
          { id: "uuid-1", name: "NoColor" },
          { name: "OnlyName", color: "#named" },
        ],
      }),
    }),
  );
  assert.equal(l.colorFor("Work/A", "A"), undefined);
  assert.equal(l.colorFor("Work/B", "B"), undefined);
  assert.equal(l.colorFor("Work/C", "C"), "#ok");
  assert.equal(l.colorFor("uuid-1", "NoColor"), undefined);
  // an entry with only name+color still contributes a name fallback.
  assert.equal(l.colorFor("whatever", "OnlyName"), "#named");
});
