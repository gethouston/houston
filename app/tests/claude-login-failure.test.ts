import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { classifyClaudeLoginFailure } from "../src/lib/claude-login-failure.ts";

describe("classifyClaudeLoginFailure", () => {
  it("routes an unrunnable helper on a remote engine to the paste flow", () => {
    // HOUSTON-APP-543: a pre-AVX2 Mac SIGILLs the Bun-compiled helper; the
    // runtime's paste flow needs no local binary, so cloud users still connect.
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
    // No remote runtime to paste into — the surface is a translated message.
    deepStrictEqual(
      classifyClaudeLoginFailure(
        { success: false, error: "helper died", helperUnavailable: true },
        false,
      ),
      { kind: "helper-unsupported" },
    );
  });

  it("routes the CLI shell gate on a remote engine to the paste flow", () => {
    // HOUSTON-APP-4ZP: the CLI refused to start for want of Git Bash /
    // PowerShell. The runtime's paste flow needs no local shell either.
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
    // Both flags set is contradictory (the CLI never ran); the helper verdict
    // is the more fundamental one and keeps its surface.
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

  it("keeps a cancel silent", () => {
    deepStrictEqual(
      classifyClaudeLoginFailure({ success: false, error: null }, true),
      { kind: "silent" },
    );
  });

  it("keeps a real login failure a plain error, never the paste flow", () => {
    // A declined authorization exits with a CODE, not a signal — rerouting it
    // to the paste flow would hide the user's own decision from them.
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
