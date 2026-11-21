import { expect, test, vi } from "vitest";
import { cancelLogin, loginPending, startLogin } from "./login";

vi.mock("./anthropic-cli-binary", () => ({
  resolveClaudeCliBinary: () => null,
}));

test("a sign-in waiting on its user is pending until it settles", async () => {
  expect(loginPending()).toBe(false);

  const info = await startLogin("anthropic");
  expect(info.kind).toBe("auth_code");
  expect(loginPending()).toBe(true);

  cancelLogin("anthropic");
  expect(loginPending()).toBe(false);
  await new Promise((r) => setTimeout(r, 100));
});
