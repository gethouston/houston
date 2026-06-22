import assert from "node:assert/strict";
import test from "node:test";
import { decodeSkillMessage } from "../src/skill-message.ts";

test("skill marker decodes uploaded attachment metadata", () => {
  const body =
    '<!--houston:skill {"skill":"review-contract","displayName":"Review contract","image":null,"description":"","integrations":[],"fields":[],"message":"Please check liability","attachments":[{"name":"msa.pdf","path":"/tmp/msa.pdf"}]}-->\n\nUse the review-contract skill.';

  assert.deepEqual(decodeSkillMessage(body)?.attachments, [
    { name: "msa.pdf", path: "/tmp/msa.pdf" },
  ]);
});

test("legacy houston:action marker still decodes", () => {
  const body =
    '<!--houston:action {"skill":"review-contract","displayName":"Review contract","image":null,"description":"","integrations":[],"fields":[],"message":"","attachments":[]}-->\n\nUse the review-contract skill.';

  assert.equal(decodeSkillMessage(body)?.skill, "review-contract");
});
