import { describe, expect, it } from "vitest";
import {
  actingFromPersisted,
  buildTurnResumeInfo,
  parseTurnResumeInfo,
} from "./turn-resume-info";

describe("buildTurnResumeInfo", () => {
  it("is always an object — its presence is what marks a turn resumable", () => {
    expect(buildTurnResumeInfo()).toEqual({});
  });

  it("keeps the pin so the resume runs on the model the user picked", () => {
    expect(
      buildTurnResumeInfo({
        provider: "anthropic",
        model: "opus",
        effort: null,
        mode: "plan",
      }),
    ).toEqual({
      pin: { provider: "anthropic", model: "opus", effort: null, mode: "plan" },
    });
  });

  it("never persists the acting-as token, only the scope it resolves to", () => {
    const info = buildTurnResumeInfo(undefined, {
      actingAs: "a-gateway-token",
      actingUser: "sub-1",
      credentialScopeKey: "u:sub-1",
      authPath: "/tmp/auth.json",
    });
    expect(info).toEqual({
      acting: {
        actingUser: "sub-1",
        credentialScopeKey: "u:sub-1",
        authPath: "/tmp/auth.json",
      },
    });
    expect(JSON.stringify(info)).not.toContain("a-gateway-token");
  });

  it("keeps the gateway-provided context the volume cannot rebuild", () => {
    expect(
      buildTurnResumeInfo(undefined, undefined, {
        workspace: "we ship on Fridays",
        user: "Ada, founder",
      }),
    ).toEqual({
      context: { workspace: "we ship on Fridays", user: "Ada, founder" },
    });
  });

  it("drops a live local-model transport — it cannot survive a restart", () => {
    expect(
      buildTurnResumeInfo(undefined, {
        localModelTransport: { deviceId: "d" } as never,
      }),
    ).toEqual({});
  });
});

describe("parseTurnResumeInfo", () => {
  it("reads nothing from a non-object", () => {
    expect(parseTurnResumeInfo(undefined)).toBeUndefined();
    expect(parseTurnResumeInfo("resume")).toBeUndefined();
  });

  it("keeps the readable half of a partly junk payload", () => {
    expect(
      parseTurnResumeInfo({
        pin: { provider: "openai", model: 4, mode: "sideways" },
        acting: { credentialScopeKey: "team", actingUser: 9 },
        context: { workspace: "ships weekly", user: 7 },
      }),
    ).toEqual({
      pin: { provider: "openai" },
      acting: { credentialScopeKey: "team" },
    });
  });

  it("reads a whole context back", () => {
    expect(
      parseTurnResumeInfo({ context: { workspace: "w", user: "u" } }),
    ).toEqual({ context: { workspace: "w", user: "u" } });
  });
});

describe("actingFromPersisted", () => {
  it("rebuilds the acting context, or none at all", () => {
    expect(actingFromPersisted(undefined)).toBeUndefined();
    expect(actingFromPersisted({ credentialScopeKey: "u:sub-1" })).toEqual({
      credentialScopeKey: "u:sub-1",
    });
  });
});
