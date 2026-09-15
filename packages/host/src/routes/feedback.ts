import { type FeedbackPayload, parseFeedbackPayload } from "../feedback";
import { json, readJson } from "./http";
import { BodyTooLargeError } from "./read-body";
import { defineRoute } from "./registry";

/**
 * "Send feedback" from the web build: the same payload the desktop files to
 * Linear via Tauri, fronted here so the browser never holds the Linear key.
 * Errors surface as real statuses — the dialog shows them (beta policy: no
 * silent loss).
 */
defineRoute({
  group: "feedback",
  method: "POST",
  path: "/feedback",
  phase: "user",
  classification: "infra",
  reason:
    "Operational intake into Linear, not a Houston resource the client reads back.",
  source: "packages/host/src/routes/feedback.ts",
  handler: async ({ deps, userId, req, res }) => {
    if (!deps.feedback)
      return json(res, 503, { error: "feedback intake not configured" });
    let payload: FeedbackPayload;
    try {
      payload = parseFeedbackPayload(await readJson(req));
    } catch (err) {
      // An oversized body is a 413 (mapped by the top-level handler), not a
      // malformed-payload 400 — let it propagate rather than mislabel it.
      if (err instanceof BodyTooLargeError) throw err;
      return json(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    json(res, 200, { id: await deps.feedback.send(payload, userId) });
  },
});
