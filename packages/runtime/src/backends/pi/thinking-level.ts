import type { Api, Model } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "../types";

type EffortModel = Pick<Model<Api>, "id" | "provider" | "thinkingLevelMap">;

export function piThinkingLevel(
  model: EffortModel | undefined,
  level: ThinkingLevel,
): ThinkingLevel | "max" {
  // Houston's max arrives as xhigh. Terra's 2026-10-26 probe in ai/codex-offered.ts
  // accepts max but not xhigh, despite pi's broader baked map.
  const probedMaxOnly =
    model?.provider === "openai-codex" && model.id === "gpt-6.1-terra";
  const catalogMaxOnly =
    model?.thinkingLevelMap?.xhigh == null &&
    model?.thinkingLevelMap?.max != null;
  return level === "xhigh" && (probedMaxOnly || catalogMaxOnly) ? "max" : level;
}
