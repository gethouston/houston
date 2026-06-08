import test from "node:test";
import assert from "node:assert/strict";
import { decodeWorkflowRunMessage } from "../src/workflow-run-message.ts";

test("workflow-run marker decodes runId", () => {
  const body = '<!--houston:workflow-run {"runId":"abc-123"}-->';
  assert.deepEqual(decodeWorkflowRunMessage(body), { runId: "abc-123" });
});

test("plain text returns null", () => {
  assert.equal(decodeWorkflowRunMessage("Could not start workflow"), null);
});

test("malformed JSON returns null", () => {
  assert.equal(decodeWorkflowRunMessage("<!--houston:workflow-run {bad}-->"), null);
});

test("missing runId returns null", () => {
  assert.equal(
    decodeWorkflowRunMessage('<!--houston:workflow-run {"workflowId":"x"}-->'),
    null,
  );
});
