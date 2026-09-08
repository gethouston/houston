import { expect, test } from "vitest";
import { errorFromResponse } from "./assistant-call-errors";
import { assistantErrorResult } from "./assistant-result";

/**
 * The host's named refusals, as the model reads them.
 *
 * PLAN MODE is the host's to enforce (routes/assistant-operate.ts): the runtime
 * withholds its acting tools, but the process holding the credential refuses
 * too. That refusal has to arrive as a NAMED state — read as a generic gateway
 * error, the only sensible reaction is to retry, and retrying is the one thing
 * that can never work here: only the user leaves plan mode.
 */

const refusal = (status: number, body: unknown) =>
  errorFromResponse(Response.json(body, { status }));

const PLAN_MODE_SENTENCE =
  "this chat is in Plan mode, so nothing is changed yet. Finish the plan and tell the user to switch to Execute when they want it done.";

test("a plan-mode refusal keeps its code and the host's own sentence", async () => {
  const error = await refusal(403, {
    code: "plan_mode",
    error: PLAN_MODE_SENTENCE,
  });

  expect(error).toEqual({
    code: "plan_mode",
    status: 403,
    message: PLAN_MODE_SENTENCE,
  });
  expect(assistantErrorResult("deleteRoutine", error).content[0]).toEqual({
    type: "text",
    text: `ERROR plan_mode: ${PLAN_MODE_SENTENCE}`,
  });
});

test("an unnamed 403 is still a gateway_error carrying its status", async () => {
  expect(await refusal(403, { error: "forbidden" })).toMatchObject({
    code: "gateway_error",
    status: 403,
  });
});

test("an unsupported operation keeps its own remedy", async () => {
  const error = await refusal(400, {
    code: "operation_not_supported",
    error: "this host cannot",
  });

  expect(error.code).toBe("operation_not_supported");
  expect(error.message).toContain("Tell the user plainly");
});

test("a host with no live turn recorded is a named state, not a gateway error", async () => {
  // The host answers 400 not_in_turn when nothing is running for this chat
  // (a late callback, a retry after the turn settled). "The gateway refused"
  // would read as something to retry; retrying is the one thing that cannot
  // work, because the correction is to act inside a turn.
  const error = await errorFromResponse(
    Response.json(
      {
        code: "not_in_turn",
        error:
          "this only works during a turn, in the chat the turn is running in",
      },
      { status: 400 },
    ),
  );
  expect(error).toEqual({
    code: "not_in_turn",
    status: 400,
    message:
      "this only works during a turn, in the chat the turn is running in",
  });
});
