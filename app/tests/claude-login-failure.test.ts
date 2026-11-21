import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { classifyClaudeLoginFailure } from "../src/lib/claude-login-failure.ts";

describe("classifyClaudeLoginFailure", () => {
  it("routes an unrunnable helper on a remote engine to the paste flow", () => {
    deepStrictEqual(
      classifyClaudeLoginFailure(
        {
          success: false,
          error: "Claude sign-in failed (exit signal)",
          helperUnavailable: true,
        },
        true,
      ),
      {
        kind: "paste-fallback",
        reason: "Claude sign-in failed (exit signal)",
      },
    );
  });

  it("explains an unrunnable helper on a co-located engine instead", () => {
    deepStrictEqual(
      classifyClaudeLoginFailure(
        { success: false, error: "helper died", helperUnavailable: true },
        false,
      ),
      { kind: "helper-unsupported" },
    );
  });

  it("routes the CLI shell gate on a remote engine to the paste flow", () => {
    deepStrictEqual(
      classifyClaudeLoginFailure(
        {
          success: false,
          error:
            "Claude sign-in failed (exit 1): unable to find CLAUDE_CODE_GIT_BASH_PATH",
          shellUnavailable: true,
        },
        true,
      ),
      {
        kind: "paste-fallback",
        reason:
          "Claude sign-in failed (exit 1): unable to find CLAUDE_CODE_GIT_BASH_PATH",
      },
    );
  });

  it("explains the CLI shell gate on a co-located engine with install copy", () => {
    deepStrictEqual(
      classifyClaudeLoginFailure(
        { success: false, error: "shell gate", shellUnavailable: true },
        false,
      ),
      { kind: "shell-unavailable" },
    );
  });

  it("lets an unrunnable helper outrank the shell gate", () => {
    deepStrictEqual(
      classifyClaudeLoginFailure(
        {
          success: false,
          error: "helper died",
          helperUnavailable: true,
          shellUnavailable: true,
        },
        false,
      ),
      { kind: "helper-unsupported" },
    );
  });

  it("routes an offline exit to the connectivity toast on any engine", () => {
    const done = {
      success: false,
      error:
        "Claude sign-in failed (exit 1): Login failed: getaddrinfo ETIMEOUT platform.claude.com",
      helperUnavailable: false,
      shellUnavailable: false,
      networkUnavailable: true,
    };
    const route = {
      kind: "offline",
      error:
        "Claude sign-in failed (exit 1): Login failed: getaddrinfo ETIMEOUT platform.claude.com",
    };
    deepStrictEqual(classifyClaudeLoginFailure(done, true), route);
    deepStrictEqual(classifyClaudeLoginFailure(done, false), route);
  });

  it("keeps a cancel silent", () => {
    deepStrictEqual(
      classifyClaudeLoginFailure({ success: false, error: null }, true),
      { kind: "silent" },
    );
  });

  it("keeps a real login failure a plain error, never the paste flow", () => {
    deepStrictEqual(
      classifyClaudeLoginFailure(
        {
          success: false,
          error: "Claude sign-in failed (exit 1): declined",
          helperUnavailable: false,
        },
        true,
      ),
      { kind: "error", error: "Claude sign-in failed (exit 1): declined" },
    );
  });

  it("tolerates a flagged payload with no reason string", () => {
    deepStrictEqual(
      classifyClaudeLoginFailure(
        { success: false, error: null, helperUnavailable: true },
        true,
      ),
      { kind: "paste-fallback", reason: "helper unavailable" },
    );
  });
});
