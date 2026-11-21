import {
  FeedbackIntakeError,
  type FeedbackPayload,
  parseFeedbackPayload,
} from "../feedback";
import { json, readJson } from "./http";
import { BodyTooLargeError } from "./read-body";
import { defineRoute } from "./registry";

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
      if (err instanceof BodyTooLargeError) throw err;
      return json(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      json(res, 200, { id: await deps.feedback.send(payload, userId) });
    } catch (err) {
      if (
        err instanceof FeedbackIntakeError &&
        err.kind === "intake_unavailable"
      )
        return json(res, 503, { error: err.message, code: err.kind });
      throw err;
    }
  },
});
