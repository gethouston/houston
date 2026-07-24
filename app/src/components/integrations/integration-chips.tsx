import { appDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { useToolkitBySlug } from "./use-toolkit-catalog";

interface Props {
  /** Composio toolkit slugs, already normalized to lowercase. */
  slugs: string[];
  /** How many logos to show before collapsing the rest into a "+N" count. */
  max?: number;
}

/**
 * A compact row of 16px toolkit logos: the apps a card's subject works with
 * (a first-party agent in the new-agent store, a skill in the picker / chat /
 * installed strip). Purely informational: the user connects apps once in the
 * Integrations tab (Composio), and every skill reaches them through the
 * integration tools.
 *
 * Logos resolve through the Composio toolkit catalog (the same `appDisplay`
 * path as the Integrations tab), because the favicon guess alone breaks for
 * every slug that isn't literally a `.com` domain (googledocs, metaads,
 * perplexityai, ...). While the catalog hasn't loaded — or on a deployment
 * with no integration provider wired — `appDisplay` falls back to the guess,
 * and {@link AppLogo} carries the per-URL failure latch so a pip that showed
 * its letter for the interim guess still upgrades when the real logo lands.
 *
 * Each pip carries the app's REAL name as its tooltip, never the machine slug.
 */
export function IntegrationChips({ slugs, max = 6 }: Props) {
  const bySlug = useToolkitBySlug();

  if (slugs.length === 0) return null;
  const shown = slugs.slice(0, max);
  const extra = slugs.length - shown.length;
  return (
    <div className="flex items-center gap-1.5">
      {shown.map((slug) => {
        const display = appDisplay(slug, bySlug.get(slug));
        return (
          <span key={slug} title={display.name} className="flex">
            <AppLogo
              display={display}
              size="xs"
              className="rounded-sm bg-input"
            />
          </span>
        );
      })}
      {extra > 0 && (
        // Decorative overflow count; hidden from the accessible name of the
        // button these chips often sit inside (a "+3" reads as noise there).
        <span
          aria-hidden="true"
          className="text-[10px] font-medium text-ink-muted"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
