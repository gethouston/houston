import type { AgentIdentity } from "@houston/agentstore-contract";
import { cn } from "@houston-ai/core";

export interface AgentIconProps {
  icon: AgentIdentity["icon"];
  /** Alt text / fallback glyph source (the agent name). */
  name: string;
  className?: string;
}

/**
 * The agent's brand mark: an emoji or an https image, on a soft tinted tile.
 * Falls back to the first letter of the name when no icon is present.
 */
export function AgentIcon({ icon, name, className }: AgentIconProps) {
  const tile = cn(
    "flex items-center justify-center overflow-hidden rounded-2xl bg-primary/10",
    className,
  );

  if (icon?.kind === "url") {
    return (
      // biome-ignore lint/performance/noImgElement: agent icons are arbitrary remote https URLs, not build-time assets
      <img
        src={icon.url}
        alt={`${name} icon`}
        className={cn(tile, "object-cover")}
      />
    );
  }

  const glyph =
    icon?.kind === "emoji" ? icon.value : name.trim().charAt(0).toUpperCase();

  return (
    <span aria-hidden className={cn(tile, "leading-none")}>
      {glyph || "🤖"}
    </span>
  );
}
