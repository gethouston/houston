import assert from "node:assert/strict";
import test from "node:test";
import { ONBOARDING_SEGMENTS } from "../../lib/onboarding-segment.ts";
import {
  agentPacksForSegment,
  SEGMENT_AGENT_PACK,
} from "./segment-agent-pack.ts";

// The expected mapping, spelled out independently of the source so a silent
// edit to SEGMENT_AGENT_PACK can't make the test agree with a regression.
const EXPECTED = {
  marketing: ["marketing", "outbound"],
  product: [],
  legal: ["legal", "operations"],
  engineering: [],
  student: [],
  design: [],
  operations: ["operations", "support"],
  people_hr: ["people", "operations"],
  data_science: [],
  finance: ["bookkeeping", "operations"],
  sales: ["sales", "outbound"],
  something_else: [],
};

test("agentPacksForSegment resolves every one of the 12 segments", () => {
  for (const segment of ONBOARDING_SEGMENTS) {
    assert.deepEqual(
      agentPacksForSegment(segment),
      EXPECTED[segment],
      `segment ${segment} should map to ${JSON.stringify(EXPECTED[segment])}`,
    );
  }
});

test("the map has an entry for every segment and no extras", () => {
  assert.deepEqual(
    Object.keys(SEGMENT_AGENT_PACK).sort(),
    [...ONBOARDING_SEGMENTS].sort(),
  );
});

test("skipped / undefined / null / unknown all fall back to [] (generic)", () => {
  assert.deepEqual(agentPacksForSegment("skipped"), []);
  assert.deepEqual(agentPacksForSegment(undefined), []);
  assert.deepEqual(agentPacksForSegment(null), []);
  assert.deepEqual(agentPacksForSegment("not_a_segment"), []);
});

test("six segments map to a pack set, six to generic", () => {
  const mapped = ONBOARDING_SEGMENTS.filter(
    (s) => agentPacksForSegment(s).length > 0,
  );
  assert.deepEqual(mapped.sort(), [
    "finance",
    "legal",
    "marketing",
    "operations",
    "people_hr",
    "sales",
  ]);
});

test("every mapped segment ships at least two agents (a set, not one)", () => {
  for (const segment of ONBOARDING_SEGMENTS) {
    const packs = agentPacksForSegment(segment);
    if (packs.length > 0) {
      assert.ok(
        packs.length >= 2,
        `${segment} should ship a set of agents, got ${packs.length}`,
      );
      // No duplicate pack within a segment's set.
      assert.equal(new Set(packs).size, packs.length);
    }
  }
});
