import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveSkillImage } from "../src/skill-message.ts";

describe("resolveSkillImage (HOU-793: flat 2D variant)", () => {
  it("resolves bare slugs to the flat Fluent Emoji CDN URL", () => {
    strictEqual(
      resolveSkillImage("rocket"),
      "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Rocket/Flat/rocket_flat.svg",
    );
  });

  it("handles multi-word slugs with encoded folder names", () => {
    strictEqual(
      resolveSkillImage("chart-increasing"),
      "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Chart%20increasing/Flat/chart_increasing_flat.svg",
    );
  });

  it("passes full URLs through untouched", () => {
    strictEqual(
      resolveSkillImage("https://example.com/icon.png"),
      "https://example.com/icon.png",
    );
  });

  it("returns null for missing or blank values", () => {
    strictEqual(resolveSkillImage(null), null);
    strictEqual(resolveSkillImage(undefined), null);
    strictEqual(resolveSkillImage("  "), null);
  });
});
