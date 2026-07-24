import { Badge } from "@houston-ai/core";
import { appDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { useToolkitBySlug } from "./use-toolkit-catalog";

/**
 * The "works with" apps as named badges — the richer sibling of
 * {@link IntegrationChips}, for detail surfaces that have room to spell the app
 * out (a store listing's detail dialog, a skill's edit modal). Names and logos
 * resolve through the Composio toolkit catalog (the same `appDisplay` path the
 * Integrations tab uses) so a detail surface never shows a machine slug. While
 * the catalog hasn't loaded, or on a deployment with no integration provider
 * wired, `appDisplay` degrades to a favicon guess and the slug as its name.
 *
 * Renders nothing when the list is empty, so callers can hand it straight
 * through without guarding. Like {@link IntegrationChips}, `toolkits` must
 * already be normalized to lowercase slugs (the Composio catalog is keyed by
 * lowercase) — normalize hand-authored input with `skillIntegrationSlugs`.
 */
export function IntegrationBadges({
  toolkits,
  label,
}: {
  toolkits: string[];
  /** Optional localized section heading rendered above the badges. */
  label?: string;
}) {
  const bySlug = useToolkitBySlug();

  if (toolkits.length === 0) return null;
  return (
    <div>
      {label && <p className="mb-1.5 font-medium text-ink text-sm">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {toolkits.map((slug) => {
          const display = appDisplay(slug, bySlug.get(slug));
          return (
            <Badge key={slug} variant="outline" className="gap-1.5 py-0.5 pl-1">
              <AppLogo display={display} size="xs" />
              {display.name}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
