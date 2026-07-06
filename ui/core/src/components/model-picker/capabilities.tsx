import { Brain, Eye, ImageIcon, type LucideIcon, Wrench } from "lucide-react";
import { cn } from "../../utils";
import { CAPABILITY_ORDER } from "./catalog";
import type { ModelCapabilityKey, ModelPickerLabels } from "./types";

/** Lucide glyph per capability, in render order (see `CAPABILITY_ORDER`). */
export const CAPABILITY_ICON: Record<ModelCapabilityKey, LucideIcon> = {
  vision: Eye,
  reasoning: Brain,
  tools: Wrench,
  imageGen: ImageIcon,
};

/** The row's capability glyph cluster: one badge per capability, lit when on. */
export function CapabilityIcons({
  capabilities,
  labels,
}: {
  capabilities: Record<ModelCapabilityKey, boolean>;
  labels: ModelPickerLabels;
}) {
  return (
    <div className="flex items-center gap-1">
      {CAPABILITY_ORDER.map((cap) => {
        const Icon = CAPABILITY_ICON[cap];
        const on = capabilities[cap];
        return (
          <span
            key={cap}
            title={capabilityLabel(cap, labels)}
            className="inline-flex size-[26px] items-center justify-center rounded-md"
            style={
              on
                ? { color: "var(--ht-cap-fg)", background: "var(--ht-cap-bg)" }
                : undefined
            }
          >
            <Icon
              className={cn("size-[15px]", !on && "text-muted-foreground/25")}
            />
          </span>
        );
      })}
    </div>
  );
}

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
