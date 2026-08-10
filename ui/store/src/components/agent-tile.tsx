import { cn, HoustonHelmet } from "@houston-ai/core";

import type { StoreAgentRow } from "../types";

const TONES = [
  "charcoal",
  "forest",
  "navy",
  "purple",
  "crimson",
  "orange",
  "golden",
] as const;

export function agentTone(
  agent: Pick<StoreAgentRow, "color" | "slug" | "name">,
) {
  const stored = TONES.find((tone) => tone === agent.color);
  if (stored) return `var(--ht-agent-${stored})`;
  const seed = agent.slug ?? agent.name;
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return `var(--ht-agent-${TONES[Math.abs(hash) % TONES.length]})`;
}

const TILE_SIZE = { sm: "size-11", md: "size-14", lg: "size-24" } as const;

export function AgentTile({
  agent,
  size = "md",
}: {
  agent: StoreAgentRow;
  size?: "sm" | "md" | "lg";
}) {
  const tileClass = cn("shrink-0 rounded-full object-cover", TILE_SIZE[size]);
  if (agent.icon?.kind === "url") {
    return <img src={agent.icon.value} alt="" className={tileClass} />;
  }
  const tone = agentTone(agent);
  return (
    <span
      className={cn(tileClass, "grid place-items-center text-white/90")}
      style={{
        background: `linear-gradient(145deg, color-mix(in oklab, ${tone} 88%, white 12%), ${tone} 55%, color-mix(in oklab, ${tone} 82%, black 18%))`,
      }}
    >
      {agent.icon?.kind === "emoji" ? (
        <span
          className={
            size === "lg" ? "text-4xl" : size === "sm" ? "text-xl" : "text-2xl"
          }
        >
          {agent.icon.value}
        </span>
      ) : (
        <HoustonHelmet
          color="currentColor"
          size={size === "lg" ? 38 : size === "sm" ? 22 : 28}
        />
      )}
    </span>
  );
}
