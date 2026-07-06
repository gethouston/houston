import { match, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  AGENT_COLORS,
  agentColorId,
  colorValue,
  resolveAgentColor,
} from "../../ui/core/src/agent-colors.ts";

/**
 * HOU-699 regression: agent avatar colors must survive a theme switch without
 * a re-render. That only holds if the resolved color is a var(--ht-agent-*)
 * reference (flipped by CSS on [data-theme="dark"]), never a hex snapshot
 * picked by reading data-theme at render time.
 */
describe("agent colors are theme-reactive CSS references (HOU-699)", () => {
  it("palette ids resolve to a var(--ht-agent-*) reference, not a hex", () => {
    for (const entry of AGENT_COLORS) {
      const resolved = resolveAgentColor(entry.id);
      strictEqual(resolved, `var(--ht-agent-${entry.id}, ${entry.light})`);
    }
  });

  it("legacy stored hexes (light or dark variant) map back to the palette var", () => {
    const navy = AGENT_COLORS.find((c) => c.id === "navy");
    if (!navy) throw new Error("navy missing from palette");
    strictEqual(resolveAgentColor(navy.light), colorValue(navy));
    strictEqual(resolveAgentColor(navy.dark), colorValue(navy));
  });

  it("defaults to the first palette color when nothing is stored", () => {
    strictEqual(resolveAgentColor(undefined), colorValue(AGENT_COLORS[0]));
  });

  it("passes through custom colors that are not in the palette", () => {
    strictEqual(resolveAgentColor("#123456"), "#123456");
  });

  it("every palette entry carries distinct light/dark hexes from the tokens", () => {
    for (const entry of AGENT_COLORS) {
      match(entry.light, /^#[0-9a-f]{6}$/);
      match(entry.dark, /^#[0-9a-f]{6}$/);
      strictEqual(
        entry.light === entry.dark,
        false,
        `${entry.id} must differ between themes`,
      );
    }
  });

  it("agentColorId keeps resolving ids and legacy hexes to the swatch id", () => {
    strictEqual(agentColorId("forest"), "forest");
    const forest = AGENT_COLORS.find((c) => c.id === "forest");
    if (!forest) throw new Error("forest missing from palette");
    strictEqual(agentColorId(forest.dark), "forest");
    strictEqual(agentColorId("not-a-color"), AGENT_COLORS[0].id);
  });
});
