import type { Api, Model } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "../types";

type EffortModel = Pick<Model<Api>, "id" | "provider" | "thinkingLevelMap">;

export function piThinkingLevel(
  model: EffortModel | undefined,
  level: ThinkingLevel,
): ThinkingLevel | "max" {
  const probedMaxOnly =
    model?.provider === "openai-codex" && model.id === "gpt-6.1-terra";
  const catalogMaxOnly =
    model?.thinkingLevelMap?.xhigh == null &&
    model?.thinkingLevelMap?.max != null;
  return level === "xhigh" && (probedMaxOnly || catalogMaxOnly) ? "max" : level;
}
