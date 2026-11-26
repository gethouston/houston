import { match, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  AGENT_COLORS,
  employeeMetalColors,
  hexColorMix,
} from "@houston-ai/core";
import { color } from "@houston/design-tokens";
import { agentAccent } from "../src/components/organization/org-chart-share-card-art.ts";

const metal = (stored: string | undefined) =>
  employeeMetalColors(
    agentAccent(stored),
    color.light["employee-metal-light"],
    color.light["employee-metal-shade"],
    hexColorMix,
  );

describe("agentAccent", () => {
  it("hands the helmet metal a colour it can mix, whatever is stored", () => {
    const stored = [
      undefined,
      "",
      "#1b6b3a",
      "#abc",
      "#0000ffcc",
      "#12345",
      "var(--ht-agent-navy)",
      "rgb(1, 2, 3)",
      ...AGENT_COLORS.flatMap((c) => [c.id, c.light, c.dark]),
    ];
    for (const value of stored)
      for (const mixed of Object.values(metal(value)))
        match(mixed, /^#[0-9a-f]{6}$/, String(value));
  });

  it("paints a palette colour in its light form, and anything unusable in the first", () => {
    const [first, second] = AGENT_COLORS;
    strictEqual(agentAccent(second.id), second.light);
    strictEqual(agentAccent(second.dark), second.light);
    strictEqual(agentAccent("#12345"), first.light);
    strictEqual(agentAccent("#0000ffcc"), first.light);
  });
});
