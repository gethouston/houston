import assert from "node:assert/strict";
import test from "node:test";
import { ONBOARDING_SEGMENTS } from "../../lib/onboarding-segment.ts";
import {
  agentPackForSegment,
  SEGMENT_AGENT_PACK,
} from "./segment-agent-pack.ts";

// The expected mapping, spelled out independently of the source so a silent
// edit to SEGMENT_AGENT_PACK can't make the test agree with a regression.
const EXPECTED = {
  marketing: "marketing",
  product: null,
  legal: "legal",
  engineering: null,
  student: null,
  design: null,
  operations: "operations",
  people_hr: "people",
  data_science: null,
  finance: "bookkeeping",
  sales: "sales",
  something_else: null,
};

test("agentPackForSegment resolves every one of the 12 segments", () => {
  for (const segment of ONBOARDING_SEGMENTS) {
    assert.equal(
      agentPackForSegment(segment),
      EXPECTED[segment],
      `segment ${segment} should map to ${EXPECTED[segment]}`,
    );
  }
});

test("the map has an entry for every segment and no extras", () => {
  assert.deepEqual(
    Object.keys(SEGMENT_AGENT_PACK).sort(),
    [...ONBOARDING_SEGMENTS].sort(),
  );
});

test("skipped / undefined / null / unknown all fall back to null (generic)", () => {
  assert.equal(agentPackForSegment("skipped"), null);
  assert.equal(agentPackForSegment(undefined), null);
  assert.equal(agentPackForSegment(null), null);
  assert.equal(agentPackForSegment("not_a_segment"), null);
});

test("exactly six segments map to a pack, six to generic", () => {
  const mapped = ONBOARDING_SEGMENTS.filter(
    (s) => agentPackForSegment(s) !== null,
  );
  assert.equal(mapped.length, 6);
  assert.deepEqual(
    mapped.sort(),
    ["finance", "legal", "marketing", "operations", "people_hr", "sales"],
  );
});
