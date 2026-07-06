import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Switch,
} from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Blocks } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppCatalogGrid } from "../../integrations/app-catalog-grid";
import { appDisplay } from "../../integrations/app-display";
import { AppRow } from "../../integrations/app-row";

interface AgentAllowlistSectionProps {
  /** The agent-level ceiling: `null` = all allowed, else the explicit set. */
  allowedToolkits: string[] | null;
  /** The org-wide ceiling the agent set may only narrow (`null` = all). */
  orgAllowedToolkits: string[] | null;
  /** Catalog for resolving slugs to real app names. */
  catalog: IntegrationToolkit[];
  /** This user's connected toolkits — the seed when first restricting. */
  connectedToolkits: string[];
  /** A write is in flight (disables the toggles). */
  saving: boolean;
  /** Persist the next ceiling: `null` = allow all, else the explicit set. */
  onSave: (next: string[] | null) => void;
}

/**
 * Agent-manager-only editor for this agent's integration allowlist ceiling
 * (Teams v2), rendered flush on its own Access drill-in pane (no card wrapper).
 * Two states: the "all apps allowed" empty state (`null`) with one Restrict CTA,
 * or the restrict state, the same {@link AppCatalogGrid} the Integrations tab
 * uses with a per-app allow Switch. Writes are instant + optimistic (the query
 * value drives each Switch); the gateway is the real enforcer. Restricting seeds
 * the allowed set with the currently-connected apps so it never cuts off apps
 * already in use.
 */
export function AgentAllowlistSection({
  allowedToolkits,
  orgAllowedToolkits,
  catalog,
  connectedToolkits,
  saving,
  onSave,
}: AgentAllowlistSectionProps) {
  const { t } = useTranslation("teams");

  // The selectable universe: the org ceiling if one is set, else the whole
  // catalog. A manager can only allow apps the org itself allows.
  const universe = useMemo(() => {
    if (orgAllowedToolkits === null) return catalog;
    const org = new Set(orgAllowedToolkits);
    return catalog.filter((tk) => org.has(tk.slug));
  }, [catalog, orgAllowedToolkits]);
  const universeSlugs = useMemo(
    () => new Set(universe.map((tk) => tk.slug)),
    [universe],
  );
  const allowedSet = useMemo(
    () => new Set(allowedToolkits ?? []),
    [allowedToolkits],
  );
  // The apps currently allowed (within the org universe), shown as their own
  // short list so a manager sees the allowed set at a glance instead of hunting
  // for the toggled-on rows inside the 1000+ app catalog.
  const allowedApps = useMemo(
    () => universe.filter((tk) => allowedSet.has(tk.slug)),
    [universe, allowedSet],
  );

  const startRestrict = () =>
    // Seed with the apps this user already has connected (kept within the org
    // ceiling) so restricting does not instantly cut off in-use apps.
    onSave([...connectedToolkits].filter((s) => universeSlugs.has(s)).sort());
  const toggle = (slug: string) => {
    const next = new Set(allowedSet);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onSave([...next].sort());
  };

  if (allowedToolkits === null) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Blocks />
          </EmptyMedia>
          <EmptyTitle>{t("integrations.allowlist.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("integrations.allowlist.emptyBody")}
          </EmptyDescription>
        </EmptyHeader>
        <Button
          className="mt-2 rounded-full"
          size="sm"
          disabled={saving}
          onClick={startRestrict}
        >
          {t("integrations.allowlist.restrict")}
        </Button>
      </Empty>
    );
  }

  return (
    <div>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-foreground">
            {t("integrations.allowlist.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integrations.allowlist.subtitle")}
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(null)}
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          {t("integrations.allowlist.allowAll")}
        </button>
      </header>
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-foreground">
          {t("integrations.allowlist.allowedHeading")}
        </h2>
        {allowedApps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("integrations.allowlist.allowedEmpty")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allowedApps.map((tk) => {
              const display = appDisplay(tk.slug, tk);
              return (
                <AppRow
                  key={tk.slug}
                  display={display}
                  description={display.description}
                  trailing={
                    <Switch
                      aria-label={t("integrations.allowlist.allowApp", {
                        name: display.name,
                      })}
                      checked
                      disabled={saving}
                      onCheckedChange={() => toggle(tk.slug)}
                    />
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-foreground">
          {t("integrations.allowlist.addHeading")}
        </h2>
        <AppCatalogGrid
          catalog={universe}
          excludeToolkits={allowedSet}
          renderRow={(display, tk) => ({
            trailing: (
              <Switch
                aria-label={t("integrations.allowlist.allowApp", {
                  name: display.name,
                })}
                checked={allowedSet.has(tk.slug)}
                disabled={saving}
                onCheckedChange={() => toggle(tk.slug)}
              />
            ),
          })}
        />
      </section>
    </div>
  );
}
