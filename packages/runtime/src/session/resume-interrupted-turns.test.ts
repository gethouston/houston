import { AUTO_CONTINUE_MARKER } from "@houston/protocol";
import { describe, expect, it, vi } from "vitest";
import {
  encodeResumePrompt,
  RESUME_PROMPT_GUIDANCE,
  RESUME_PROMPT_LEAD,
  resumeInterruptedTurns,
} from "./resume-interrupted-turns";
import type { ResumeRequest } from "./turn-resume-info";

const request = (over: Partial<ResumeRequest> = {}): ResumeRequest => ({
  conversationId: "chat",
  turnId: "t-1",
  text: "build the deck",
  ...over,
});

const noSleep = () => Promise.resolve();

describe("encodeResumePrompt", () => {
  it("hides the bubble, names the restart, quotes the request, and says what survived", () => {
    const prompt = encodeResumePrompt(request());
    expect(prompt.startsWith(AUTO_CONTINUE_MARKER)).toBe(true);
    expect(prompt).toContain(RESUME_PROMPT_LEAD);
    expect(prompt).toContain("build the deck");
    expect(prompt).toContain(RESUME_PROMPT_GUIDANCE);
  });
});

describe("resumeInterruptedTurns", () => {
  it("runs each request once, with its pin, acting scope and the interrupted turn id", async () => {
    const runTurn = vi.fn().mockResolvedValue(undefined);
    await resumeInterruptedTurns(
      [
        request({
          pin: { provider: "anthropic", model: "opus" },
          acting: { credentialScopeKey: "u:sub-1" },
        }),
        request({ conversationId: "other", turnId: "t-2", text: "ship it" }),
      ],
      { runTurn, sleep: noSleep },
    );

    expect(runTurn).toHaveBeenCalledTimes(2);
    const [id, text, nonce, pin, acting, context, displayText, mentions, opts] =
      runTurn.mock.calls[0] ?? [];
    expect(id).toBe("chat");
    expect(text).toContain("build the deck");
    expect(nonce).toBeUndefined();
    expect(pin).toEqual({ provider: "anthropic", model: "opus" });
    expect(acting).toEqual({ credentialScopeKey: "u:sub-1" });
    expect(context).toBeUndefined();
    expect(displayText).toBeUndefined();
    expect(mentions).toBeUndefined();
    expect(opts).toEqual({ resumeOf: "t-1" });
    expect(runTurn.mock.calls[1]?.[8]).toEqual({ resumeOf: "t-2" });
  });

  it("waits out the credential-prime delay before sending", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const runTurn = vi.fn().mockResolvedValue(undefined);
    await resumeInterruptedTurns([request()], {
      runTurn,
      sleep,
      delayMs: 1_234,
    });
    expect(sleep).toHaveBeenCalledWith(1_234);
  });

  it("does nothing at all when the boot found nothing to resume", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const runTurn = vi.fn();
    await resumeInterruptedTurns([], { runTurn, sleep });
    expect(sleep).not.toHaveBeenCalled();
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("logs a failed resume and still runs the rest — it never rejects", async () => {
    const boom = new Error("no provider connected");
    const runTurn = vi
      .fn()
      .mockRejectedValueOnce(boom)
      .mockResolvedValue(undefined);
    const log = vi.fn();
    await expect(
      resumeInterruptedTurns(
        [request(), request({ conversationId: "other", turnId: "t-2" })],
        { runTurn, log, sleep: noSleep },
      ),
    ).resolves.toBeUndefined();
    expect(runTurn).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain(
      "[turn] resume after restart failed",
    );
    expect(log.mock.calls[0]?.[0]).toContain("turn=t-1");
    expect(log.mock.calls[0]?.[1]).toBe(boom);
  });
});
