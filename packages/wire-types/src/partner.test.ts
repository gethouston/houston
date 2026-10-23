import { describe, expect, it } from "vitest";
import { parseAgentPause, parsePartnerRefusal } from "./partner";

const PAUSE = { by: "u_partner", at: "2026-10-23T15:00:00.000Z" };

describe("parseAgentPause", () => {
  it("reads a pause, with the partner's note", () => {
    expect(parseAgentPause({ ...PAUSE, note: "Contrato vencido" })).toEqual({
      ...PAUSE,
      note: "Contrato vencido",
    });
  });

  it("drops an empty note", () => {
    expect(parseAgentPause({ ...PAUSE, note: "" })).toEqual(PAUSE);
  });

  it("refuses a pause with no author or no valid instant", () => {
    expect(parseAgentPause({ at: PAUSE.at })).toBeNull();
    expect(parseAgentPause({ by: "", at: PAUSE.at })).toBeNull();
    expect(parseAgentPause({ by: PAUSE.by, at: "yesterday" })).toBeNull();
    expect(parseAgentPause(null)).toBeNull();
  });
});

describe("parsePartnerRefusal", () => {
  it("reads agent_paused with the pause that names who to contact", () => {
    expect(
      parsePartnerRefusal({
        code: "agent_paused",
        error: "agent paused",
        pause: PAUSE,
      }),
    ).toEqual({ code: "agent_paused", error: "agent paused", pause: PAUSE });
  });

  it("reads partner_managed, which carries no pause", () => {
    expect(
      parsePartnerRefusal({ code: "partner_managed", error: "partner only" }),
    ).toEqual({ code: "partner_managed", error: "partner only" });
  });

  it("keeps the refusal when its pause is malformed, dropping only the pause", () => {
    expect(
      parsePartnerRefusal({
        code: "agent_paused",
        error: "agent paused",
        pause: { by: PAUSE.by },
      }),
    ).toEqual({ code: "agent_paused", error: "agent paused" });
  });

  it("is null for any other body", () => {
    expect(
      parsePartnerRefusal({ code: "compute_busy", error: "x" }),
    ).toBeNull();
    expect(parsePartnerRefusal({ code: "agent_paused" })).toBeNull();
    expect(parsePartnerRefusal("agent_paused")).toBeNull();
  });
});
