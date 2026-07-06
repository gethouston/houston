import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { appDisplay } from "../../integrations/app-display";
import { ToolkitPicker } from "./toolkit-picker";

interface AgentAllowlistSectionProps {
  /** The agent-level ceiling: `null` = all allowed, else the explicit set. */
  allowedToolkits: string[] | null;
  /** The org-wide ceiling the agent set may only narrow (`null` = all). */
  orgAllowedToolkits: string[] | null;
  /** Catalog for resolving slugs to real app names. */
  catalog: IntegrationToolkit[];
  /** This user's connected toolkits — the seed when first restricting. */
  connectedToolkits: string[];
  /** A save is in flight (disables the controls). */
  saving: boolean;
  /** Persist the next ceiling: `null` = allow all, else the explicit set. */
  onSave: (next: string[] | null) => void;
}

/**
 * Agent-manager-only editor for this agent's integration allowlist ceiling
 * (Teams v2). Two resting states: "All integrations allowed" (`null`) with a
 * Restrict affordance, or the explicit allowed set with Edit / Allow-all. Edit
 * opens a multi-select over the org ceiling; Save writes the chosen set. The
 * gateway is the real enforcer (this only previews + writes the ceiling).
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
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<Set<string>>(new Set());

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
  const bySlug = useMemo(
    () => new Map(catalog.map((tk) => [tk.slug, tk])),
    [catalog],
  );

  const startRestrict = () => {
    // Seed with the apps this user already has connected (kept within the org
    // ceiling) so restricting does not instantly cut off in-use apps.
    setWorking(new Set(connectedToolkits.filter((s) => universeSlugs.has(s))));
    setEditing(true);
  };
  const startEdit = () => {
    setWorking(new Set(allowedToolkits ?? []));
    setEditing(true);
  };
  const toggle = (slug: string) =>
    setWorking((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  const save = () => {
    onSave([...working].sort());
    setEditing(false);
  };

  return (
    <section className="mt-8 rounded-xl border border-border p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">
          {t("integrations.allowlist.title")}
        </h2>
        {!editing && allowedToolkits !== null && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(null)}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {t("integrations.allowlist.allowAll")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("integrations.allowlist.subtitle")}
      </p>

      {editing ? (
        <div className="flex flex-col gap-3">
          <ToolkitPicker
            options={universe}
            selected={working}
            onToggle={toggle}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="inline-flex h-8 items-center rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {t("integrations.allowlist.save")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(false)}
              className="inline-flex h-8 items-center rounded-full border border-border bg-background px-4 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              {t("integrations.allowlist.cancel")}
            </button>
          </div>
        </div>
      ) : allowedToolkits === null ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-foreground">
            {t("integrations.allowlist.allAllowed")}
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={startRestrict}
            className="inline-flex h-8 shrink-0 items-center rounded-full border border-border bg-background px-4 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {t("integrations.allowlist.restrict")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {allowedToolkits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("integrations.allowlist.none")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allowedToolkits.map((slug) => (
                <span
                  key={slug}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground"
                >
                  {appDisplay(slug, bySlug.get(slug)).name}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={startEdit}
            className="inline-flex h-8 w-fit items-center rounded-full border border-border bg-background px-4 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {t("integrations.allowlist.edit")}
          </button>
        </div>
      )}
    </section>
  );
}
