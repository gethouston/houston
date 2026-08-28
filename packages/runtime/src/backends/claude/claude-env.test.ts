import { afterEach, expect, test } from "vitest";
import { buildClaudeEnv } from "./claude-env";

const savedHome = process.env.HOME;

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
});

test("an explicit home overrides the ambient HOME", () => {
  process.env.HOME = "/ambient";

  const env = buildClaudeEnv(undefined, {
    configDir: "/config",
    homeDir: "/turn/home",
  });

  expect(env.HOME).toBe("/turn/home");
  expect(env.CLAUDE_CONFIG_DIR).toBe("/config");
});

test("the credential store remains optional and must be absolute", () => {
  expect(
    buildClaudeEnv(undefined, {
      configDir: "/config",
      credentialStorageDir: "/turn/credentials",
    }).CLAUDE_SECURESTORAGE_CONFIG_DIR,
  ).toBe("/turn/credentials");
  expect(() =>
    buildClaudeEnv(undefined, {
      configDir: "/config",
      credentialStorageDir: "relative",
    }),
  ).toThrow(/absolute path/);
});
