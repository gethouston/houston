import { AUTO_CONTINUE_MARKER } from "@houston/protocol";
import { describe, expect, it, vi } from "vitest";
import { currentCredentialScope } from "./acting-context";
import { resumeInterruptedTurns } from "./resume-interrupted-turns";
import {
  encodeResumePrompt,
  RESUME_PROMPT_GUIDANCE,
  RESUME_PROMPT_LEAD,
} from "./resume-prompt";
import type { ResumeRequest } from "./resume-request";

const request = (over: Partial<ResumeRequest> = {}): ResumeRequest => ({
  conversationId: "chat",
  turnId: "t-1",
  text: "build the deck",
  ...over,
});

const noSleep = () => Promise.resolve();

/**
 * The runtime gates, all open: nothing draining, a provider connected, and the
 * resumed turn recorded (the transcript seams are exercised in their own test).
 */
const gates = {
  isDraining: () => false,
  holdTurn: () => {},
  ensureProvider: async () => "anthropic",
  connectedProvider: async () => "anthropic",
  recorded: () => true,
  revoke: () => {},
};

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
  it("runs each request once, with its pin, acting scope, context, mentions and turn id", async () => {
    const runTurn = vi.fn().mockResolvedValue(undefined);
    await resumeInterruptedTurns(
      [
        request({
          pin: { provider: "anthropic", model: "opus" },
          acting: { credentialScopeKey: "u:sub-1" },
          context: { workspace: "ships weekly", user: "Ada" },
          mentions: [{ userId: "u1", name: "Ada" }],
        }),
        request({ conversationId: "other", turnId: "t-2", text: "ship it" }),
      ],
      { runTurn, sleep: noSleep, ...gates },
    );

    expect(runTurn).toHaveBeenCalledTimes(2);
    const [
      id,
      text,
      nonce,
      pin,
      acting,
      context,
      displayText,
      mentions,
      acceptedTurnId,
      opts,
    ] = runTurn.mock.calls[0] ?? [];
    expect(id).toBe("chat");
    expect(text).toContain("build the deck");
    expect(nonce).toBeUndefined();
    expect(pin).toEqual({ provider: "anthropic", model: "opus" });
    expect(acting).toEqual({ credentialScopeKey: "u:sub-1" });
    expect(context).toEqual({ workspace: "ships weekly", user: "Ada" });
    expect(displayText).toBeUndefined();
    expect(mentions).toEqual([{ userId: "u1", name: "Ada" }]);
    expect(acceptedTurnId).toBeUndefined();
    expect(opts).toEqual({ resumeOf: "t-1" });
    expect(runTurn.mock.calls[1]?.[9]).toEqual({ resumeOf: "t-2" });
  });

  it("runs the turn INSIDE the persisted credential scope, not the ambient one", async () => {
    let scope: string | undefined;
    const runTurn = vi.fn().mockImplementation(async () => {
      scope = currentCredentialScope().key;
    });
    await resumeInterruptedTurns(
      [request({ acting: { credentialScopeKey: "u:sub-1" } })],
      { runTurn, sleep: noSleep, ...gates },
    );
    expect(scope).toBe("u:sub-1");
  });

  it("never syncs a credential for a per-user scope — the sync would fetch the team's", async () => {
    const ensureProvider = vi.fn().mockResolvedValue("anthropic");
    const connectedProvider = vi.fn().mockResolvedValue("anthropic");
    await resumeInterruptedTurns(
      [request({ acting: { credentialScopeKey: "u:sub-1" } })],
      {
        runTurn: vi.fn().mockResolvedValue(undefined),
        sleep: noSleep,
        ...gates,
        ensureProvider,
        connectedProvider,
      },
    );
    expect(ensureProvider).not.toHaveBeenCalled();
    expect(connectedProvider).toHaveBeenCalledTimes(1);
  });

  it("syncs for the team scope, where the sync fetches the right credential", async () => {
    const ensureProvider = vi.fn().mockResolvedValue("anthropic");
    const connectedProvider = vi.fn().mockResolvedValue("anthropic");
    await resumeInterruptedTurns(
      [request({ acting: { credentialScopeKey: "team" } }), request()],
      {
        runTurn: vi.fn().mockResolvedValue(undefined),
        sleep: noSleep,
        ...gates,
        ensureProvider,
        connectedProvider,
      },
    );
    expect(ensureProvider).toHaveBeenCalledTimes(2);
    expect(connectedProvider).not.toHaveBeenCalled();
  });

  it("waits out the credential-prime delay before sending", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const runTurn = vi.fn().mockResolvedValue(undefined);
    await resumeInterruptedTurns([request()], {
      runTurn,
      sleep,
      delayMs: 1_234,
      ...gates,
    });
    expect(sleep).toHaveBeenCalledWith(1_234);
  });

  it("does nothing at all when the boot found nothing to resume", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const runTurn = vi.fn();
    await resumeInterruptedTurns([], { runTurn, sleep, ...gates });
    expect(sleep).not.toHaveBeenCalled();
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("logs a failed resume, revokes its promise, and still runs the rest", async () => {
    const boom = new Error("no provider connected");
    const runTurn = vi
      .fn()
      .mockRejectedValueOnce(boom)
      .mockResolvedValue(undefined);
    const log = vi.fn();
    const revoke = vi.fn();
    await expect(
      resumeInterruptedTurns(
        [request(), request({ conversationId: "other", turnId: "t-2" })],
        { runTurn, log, sleep: noSleep, ...gates, revoke },
      ),
    ).resolves.toBeUndefined();
    expect(runTurn).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain(
      "[turn] resume after restart failed",
    );
    expect(log.mock.calls[0]?.[0]).toContain("turn=t-1");
    expect(log.mock.calls[0]?.[1]).toBe(boom);
    expect(revoke.mock.calls).toEqual([["chat", "t-1"]]);
  });

  it("holds the conversation against commands for the life of the resume", async () => {
    const runTurn = vi.fn().mockResolvedValue(undefined);
    const holdTurn = vi.fn();
    await resumeInterruptedTurns([request()], {
      runTurn,
      sleep: noSleep,
      ...gates,
      holdTurn,
    });
    expect(holdTurn).toHaveBeenCalledTimes(1);
    expect(holdTurn.mock.calls[0]?.[0]).toBe("chat");
    await expect(holdTurn.mock.calls[0]?.[1]).resolves.toBeUndefined();
  });

  it("starts nothing on a draining runtime, and un-promises every waiting turn", async () => {
    const runTurn = vi.fn();
    const log = vi.fn();
    const revoke = vi.fn();
    await resumeInterruptedTurns(
      [request(), request({ conversationId: "other", turnId: "t-2" })],
      {
        runTurn,
        log,
        sleep: noSleep,
        ...gates,
        revoke,
        isDraining: () => true,
      },
    );
    expect(runTurn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain("runtime is draining");
    expect(revoke.mock.calls).toEqual([
      ["chat", "t-1"],
      ["other", "t-2"],
    ]);
  });

  it("waits for the served credential to land before sending", async () => {
    const runTurn = vi.fn().mockResolvedValue(undefined);
    const ensureProvider = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue("anthropic");
    const sleep = vi.fn().mockResolvedValue(undefined);
    await resumeInterruptedTurns([request()], {
      runTurn,
      sleep,
      ...gates,
      ensureProvider,
      providerRetryMs: 50,
    });
    expect(ensureProvider).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(50);
    expect(runTurn).toHaveBeenCalledTimes(1);
  });

  it("drops the resume when no provider ever connects, says so, and revokes", async () => {
    const runTurn = vi.fn();
    const log = vi.fn();
    const revoke = vi.fn();
    await resumeInterruptedTurns([request()], {
      runTurn,
      log,
      sleep: noSleep,
      ...gates,
      revoke,
      ensureProvider: async () => null,
      providerRetries: 2,
    });
    expect(runTurn).not.toHaveBeenCalled();
    expect(log.mock.calls[0]?.[0]).toContain("no provider connected");
    expect(revoke.mock.calls).toEqual([["chat", "t-1"]]);
  });

  it("revokes when runTurn resolved but recorded nothing — it refused early", async () => {
    const runTurn = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    const revoke = vi.fn();
    await resumeInterruptedTurns([request()], {
      runTurn,
      log,
      sleep: noSleep,
      ...gates,
      revoke,
      recorded: () => false,
    });
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain("recorded nothing");
    expect(revoke.mock.calls).toEqual([["chat", "t-1"]]);
  });

  it("leaves the promise standing when the resume really did start", async () => {
    const revoke = vi.fn();
    await resumeInterruptedTurns([request()], {
      runTurn: vi.fn().mockResolvedValue(undefined),
      sleep: noSleep,
      ...gates,
      revoke,
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it("a pinned provider runs on runTurn's own gate even with nothing connected", async () => {
    const runTurn = vi.fn().mockResolvedValue(undefined);
    await resumeInterruptedTurns(
      [request({ pin: { provider: "ollama", model: "llama" } })],
      { runTurn, sleep: noSleep, ...gates, ensureProvider: async () => null },
    );
    expect(runTurn).toHaveBeenCalledTimes(1);
  });
});
