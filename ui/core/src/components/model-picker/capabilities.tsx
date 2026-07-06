import { Brain, Eye, ImageIcon, type LucideIcon, Wrench } from "lucide-react";
import type { ModelCapabilityKey, ModelPickerLabels } from "./types";

/** Lucide glyph per capability, in render order (see `CAPABILITY_ORDER`). */
export const CAPABILITY_ICON: Record<ModelCapabilityKey, LucideIcon> = {
  vision: Eye,
  reasoning: Brain,
  tools: Wrench,
  imageGen: ImageIcon,
};

/** Resolve the localized name for a capability from the labels bag. */
export function capabilityLabel(
  cap: ModelCapabilityKey,
  labels: ModelPickerLabels,
): string {
  switch (cap) {
    case "vision":
      return labels.capVision;
    case "reasoning":
      return labels.capReasoning;
    case "tools":
      return labels.capTools;
    case "imageGen":
      return labels.capImageGen;
  }
}
