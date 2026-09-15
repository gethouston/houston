import { HANDS_ON_SURFACES } from "@houston/protocol/interaction-types";
import { describe, expect, it } from "vitest";
import {
  ASSISTANT_HANDS_TOOLS,
  type AssistantHands,
  parseAssistantHands,
} from "./assistant-hands";

/**
 * The tag is the only place a hidden operation says how the person still gets
 * it done, so every spelling the gate accepts is pinned here — and so is every
 * one it must refuse, because a card the app cannot open reaches the model as
 * an instruction to offer the user a dead end.
 */

const problem = (text: string): string => {
  const parsed = parseAssistantHands(text);
  if (parsed.kind !== "invalid")
    throw new Error(`${text} parsed as ${parsed.kind}`);
  return parsed.problem;
};

describe("card spellings", () => {
  it("reads every card that takes no surface", () => {
    for (const tool of ASSISTANT_HANDS_TOOLS) {
      if (tool === "request_hands_on") continue;
      expect(parseAssistantHands(tool)).toEqual<AssistantHands>({
        kind: "card",
        tool,
      });
    }
  });

  it("reads request_hands_on with every surface the app can open", () => {
    for (const surface of HANDS_ON_SURFACES)
      expect(parseAssistantHands(`request_hands_on(${surface})`)).toEqual({
        kind: "card",
        tool: "request_hands_on",
        surface,
      });
  });

  it("ignores the whitespace an author leaves around the tag", () => {
    expect(parseAssistantHands("  request_hands_on( billing )  ")).toEqual({
      kind: "card",
      tool: "request_hands_on",
      surface: "billing",
    });
  });
});

describe("the authored escape", () => {
  it("reads a reason that runs to the end of the tag", () => {
    expect(
      parseAssistantHands(
        "unreachable first-run setup happens before any agent exists.",
      ),
    ).toEqual({
      kind: "unreachable",
      reason: "first-run setup happens before any agent exists.",
    });
  });

  it("refuses an escape that states nothing", () => {
    expect(problem("unreachable")).toContain("says nothing");
    expect(problem("unreachable   ")).toContain("says nothing");
  });
});

describe("refusals", () => {
  it("refuses request_hands_on with no surface", () => {
    const stated = problem("request_hands_on");
    for (const surface of HANDS_ON_SURFACES) expect(stated).toContain(surface);
  });

  it("refuses a surface the app cannot open", () => {
    expect(problem("request_hands_on(dashboard)")).toContain("dashboard");
    expect(problem("request_hands_on()")).toContain("not one of");
  });

  it("refuses a surface on a card that opens no named screen", () => {
    expect(problem("request_connection(billing)")).toContain(
      "takes no surface",
    );
  });

  it("refuses a tool outside the card vocabulary", () => {
    const stated = problem("request_anything");
    for (const tool of ASSISTANT_HANDS_TOOLS) expect(stated).toContain(tool);
  });

  it("refuses text that is not a card name at all", () => {
    expect(problem("the person does it")).toContain("not a card name");
    expect(problem("")).toContain("not a card name");
  });
});
