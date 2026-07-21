import { useState } from "react";
import { appDisplay, useToolkitBySlug } from "./integrations";

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
 *
 * Logos resolve through the Composio toolkit catalog (the same `appDisplay`
 * path as the Integrations tab), because the favicon guess alone breaks for
 * every slug that isn't literally a `.com` domain (googledocs, metaads,
 * perplexityai, ...). While the catalog hasn't loaded — or on a deployment
 * with no integration provider wired — `appDisplay` falls back to the guess.
 */
export function AgentIntegrationChips({ slugs, max = 6 }: Props) {
  const bySlug = useToolkitBySlug();

  if (slugs.length === 0) return null;
  const shown = slugs.slice(0, max);
  const extra = slugs.length - shown.length;
  return (
    <div className="flex items-center gap-1.5">
      {shown.map((slug) => (
        <IntegrationPip
          key={slug}
          slug={slug}
          logoUrl={appDisplay(slug, bySlug.get(slug)).logoUrl}
        />
      ))}
      {extra > 0 && (
        <span className="text-[10px] font-medium text-ink-muted">+{extra}</span>
      )}
    </div>
  );
}

function IntegrationPip({ slug, logoUrl }: { slug: string; logoUrl: string }) {
  // Remember WHICH url failed, not just that one did: when the catalog loads
  // and upgrades the src from the favicon guess to the real logo, a boolean
  // would keep the letter fallback on screen for the new, working url.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (brokenUrl === logoUrl) {
    return (
      <span
        title={slug}
        className="flex size-4 items-center justify-center rounded-[4px] bg-input text-[9px] font-semibold text-ink-muted"
      >
        {slug.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={logoUrl}
      alt={slug}
      title={slug}
      className="size-4 rounded-[4px] bg-input object-contain"
      onError={() => setBrokenUrl(logoUrl)}
    />
  );
}
