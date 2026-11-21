import type { AgentIdentity } from "@houston/agentstore-contract";
import { cn } from "@houston-ai/core";

export interface AgentIconProps {
  icon: AgentIdentity["icon"];
  name: string;
  className?: string;
}

export function AgentIcon({ icon, name, className }: AgentIconProps) {
  const tile = cn(
    "flex items-center justify-center overflow-hidden rounded-2xl bg-action/10",
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
