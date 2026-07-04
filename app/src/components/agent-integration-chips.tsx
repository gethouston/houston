import { useState } from "react";
import { fallbackLogo } from "./tabs/integrations-app-display";

interface Props {
  /** Composio toolkit slugs the agent is designed to work with. */
  slugs: string[];
  /** How many logos to show before collapsing the rest into a "+N" count. */
  max?: number;
}

/**
 * A compact row of toolkit logos for an agent card — the apps a first-party
 * agent is designed to use. Purely informational: on the TS engine the user
 * connects apps once in the Integrations tab (Composio), and every agent's
 * skills reach them through the integration tools.
 */
export function AgentIntegrationChips({ slugs, max = 6 }: Props) {
  if (slugs.length === 0) return null;
  const shown = slugs.slice(0, max);
  const extra = slugs.length - shown.length;
  return (
    <div className="flex items-center gap-1.5">
      {shown.map((slug) => (
        <IntegrationPip key={slug} slug={slug} />
      ))}
      {extra > 0 && (
        <span className="text-[10px] font-medium text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}

function IntegrationPip({ slug }: { slug: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span
        title={slug}
        className="flex size-4 items-center justify-center rounded-[4px] bg-background text-[9px] font-semibold text-muted-foreground"
      >
        {slug.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={fallbackLogo(slug)}
      alt={slug}
      title={slug}
      className="size-4 rounded-[4px] bg-background object-contain"
      onError={() => setBroken(true)}
    />
  );
}
