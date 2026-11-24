import { expect, test } from "vitest";
import { errorFromResponse } from "./assistant-call-errors";
import { assistantErrorResult } from "./assistant-result";

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

test("a chat the assistant may not change is a named state, not a gateway error", async () => {
  const sentence =
    "that chat belongs to a mission's card, not to the user's list of chats.";
  const error = await refusal(409, {
    code: "protected_conversation",
    error: sentence,
  });

  expect(error).toEqual({
    code: "protected_conversation",
    status: 409,
    message: sentence,
  });
});

test("a createAgent onto a taken name reads as the host's own sentence", async () => {
  const upstream = JSON.stringify({
    error: 'an agent named "Mia" already exists in this workspace',
    code: "name_taken",
  });
  const error = await refusal(409, { error: upstream, code: "gateway_error" });

  expect(error).toMatchObject({ code: "gateway_error", status: 409 });
  expect(assistantErrorResult("createAgent", error).content[0]).toMatchObject({
    text: expect.stringContaining(
      'an agent named \\"Mia\\" already exists in this workspace',
    ),
  });
});

test("a createAgent named Houston reads as the host's reserved-name sentence", async () => {
  const upstream = JSON.stringify({
    error:
      "Houston is the AI Manager's own name, so an AI Employee can't use it. Ask the user for another name.",
    code: "name_reserved",
  });
  const error = await refusal(400, { error: upstream, code: "gateway_error" });

  expect(error).toMatchObject({ code: "gateway_error", status: 400 });
  expect(assistantErrorResult("createAgent", error).content[0]).toMatchObject({
    text: expect.stringContaining(
      "Houston is the AI Manager's own name, so an AI Employee can't use it. Ask the user for another name.",
    ),
  });
});

test("compute_busy is a named busy state, never a gateway error", async () => {
  const error = await refusal(503, {
    error: "engine unavailable",
    code: "compute_busy",
  });
  expect(error.code).toBe("compute_busy");
  expect(error.status).toBe(503);
  expect(error.message).not.toContain("engine unavailable");
  expect(error.message).toContain("try again in a few minutes");
});

test("pod_wake_refused is operation_unavailable_here with no retry", async () => {
  const error = await refusal(503, {
    error: "engine unavailable",
    code: "pod_wake_refused",
  });
  expect(error.code).toBe("operation_unavailable_here");
  expect(error.message).toContain("Do not retry");
});
