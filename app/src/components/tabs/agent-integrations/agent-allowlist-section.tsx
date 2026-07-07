import { Switch } from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppCatalogGrid } from "../../integrations/app-catalog-grid";
import { appDisplay } from "../../integrations/app-display";
import { AppRow } from "../../integrations/app-row";
import { AccessChoice } from "../agent-admin/access-choice.tsx";
import {
  type AccessMode,
  ceilingMode,
} from "../agent-admin/agent-admin-row-values.ts";

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
 * (Teams v2), rendered flush in the Access section's right pane (no card wrapper).
 * An always-visible two-option choice ("Any app" saves `null`, "Only apps you
 * pick" saves an explicit set) replaces the old verb-flipping Restrict/Allow-all
 * buttons. When restricting, the same {@link AppCatalogGrid} the Integrations
 * tab uses with a per-app allow Switch. Writes are instant + optimistic (the
 * query value drives each Switch); the gateway is the real enforcer. Choosing
 * "Only apps you pick" seeds the allowed set with the currently-connected apps
 * so it never cuts off apps already in use.
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

  const onChoice = (mode: AccessMode) =>
    mode === "any"
      ? onSave(null)
      : // Seed with the apps this user already has connected (kept within the org
        // ceiling) so restricting does not instantly cut off in-use apps.
        onSave(
          [...connectedToolkits].filter((s) => universeSlugs.has(s)).sort(),
        );
  const toggle = (slug: string) => {
    const next = new Set(allowedSet);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onSave([...next].sort());
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium text-foreground">
        {t("integrations.allowlist.question")}
      </h2>

      <AccessChoice
        question={t("integrations.allowlist.question")}
        value={ceilingMode(allowedToolkits)}
        disabled={saving}
        onChange={onChoice}
        options={[
          {
            value: "any",
            label: t("integrations.allowlist.anyLabel"),
            description: t("integrations.allowlist.anyDesc"),
          },
          {
            value: "picked",
            label: t("integrations.allowlist.pickedLabel"),
            description: t("integrations.allowlist.pickedDesc"),
          },
        ]}
      />

      {allowedToolkits !== null && (
        <div className="mt-6">
          <section className="mb-8">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              {t("integrations.allowlist.allowedHeading")}
            </h3>
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
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("integrations.allowlist.addHeading")}
            </h3>
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
      )}
    </div>
  );
}
