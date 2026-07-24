import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  fluentEmojiUrl,
  resolveSkillImageUrl,
} from "../src/lib/skill-image.ts";

describe("fluentEmojiUrl (HOU-793: flat 2D variant)", () => {
  it("builds the Flat SVG URL for a single-word slug", () => {
    strictEqual(
      fluentEmojiUrl("rocket"),
      "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Rocket/Flat/rocket_flat.svg",
    );
  });

  it("capitalizes only the first word of multi-word folders and encodes spaces", () => {
    strictEqual(
      fluentEmojiUrl("chart-increasing"),
      "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Chart%20increasing/Flat/chart_increasing_flat.svg",
    );
  });

  it("normalizes underscores and whitespace separators alike", () => {
    strictEqual(
      fluentEmojiUrl("magnifying_glass tilted-left"),
      "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Magnifying%20glass%20tilted%20left/Flat/magnifying_glass_tilted_left_flat.svg",
    );
  });
});

describe("resolveSkillImageUrl", () => {
  it("passes full URLs through untouched", () => {
    strictEqual(
      resolveSkillImageUrl("https://example.com/icon.png"),
      "https://example.com/icon.png",
    );
  });

  it("resolves bare slugs to the flat Fluent Emoji CDN URL", () => {
    strictEqual(
      resolveSkillImageUrl("sparkles"),
      "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Sparkles/Flat/sparkles_flat.svg",
    );
  });

  it("returns null for missing or blank values", () => {
    strictEqual(resolveSkillImageUrl(null), null);
    strictEqual(resolveSkillImageUrl(undefined), null);
    strictEqual(resolveSkillImageUrl("   "), null);
  });
});
