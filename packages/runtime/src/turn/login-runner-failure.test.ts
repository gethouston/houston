import { expect, test } from "vitest";
import { COPILOT_NO_ACCESS_ERROR } from "../auth/login-state";
import { loadLoginRunner } from "./login-runner";

test("the login runner reports a Copilot no-access failure as the shared sentinel", async () => {
  const runner = await loadLoginRunner();
  const raw =
    '403 Forbidden: {"error_details":{"message":"No access to GitHub Copilot found. You are currently logged in as octocat.","notification_id":"no_copilot_access"},"can_signup_for_limited":true}';
  const answer = runner.failure("github-copilot", new Error(raw));
  expect(answer.error).toBe(COPILOT_NO_ACCESS_ERROR);
  expect(JSON.stringify(answer)).not.toContain("octocat");
  expect(runner.failure("anthropic", new Error("plain")).error).toBe("plain");
});
