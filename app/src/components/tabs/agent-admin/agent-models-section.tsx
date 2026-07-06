import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Switch,
} from "@houston-ai/core";
import { Cpu, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelCatalogEntry } from "./agent-admin-models-catalog.ts";

interface AgentModelsSectionProps {
  /** The agent-level model ceiling: `null` = all allowed, else the explicit set. */
  allowedModels: string[] | null;
  /** The selectable model catalog. */
  catalog: ModelCatalogEntry[];
  /** A write is in flight (disables the controls). */
  saving: boolean;
  /** Persist the next ceiling: `null` = allow all, else the explicit set. */
  onSave: (next: string[] | null) => void;
}

/**
 * Agent-manager-only editor for this agent's AI-model ceiling (Teams v2),
 * rendered flush on its Access drill-in pane (no card wrapper). Mirrors
 * {@link AgentAllowlistSection}: an "all models allowed" empty state (`null`)
 * with one Restrict CTA, or the restrict state, a searchable list of model rows
 * each with an allow Switch (the same row/Switch styling as the apps editor, no
 * category dropdown since the model catalog is small). Writes are instant +
 * optimistic; each member then picks their own model from the allowed set. The
 * gateway is the real enforcer.
 */
export function AgentModelsSection({
  allowedModels,
  catalog,
  saving,
  onSave,
}: AgentModelsSectionProps) {
  const { t } = useTranslation("teams");
  const [search, setSearch] = useState("");

  const allowedSet = useMemo(
    () => new Set(allowedModels ?? []),
    [allowedModels],
  );
  // The models currently allowed, shown as their own short list above the rest.
  const allowedList = useMemo(
    () => catalog.filter((m) => allowedSet.has(m.id)),
    [catalog, allowedSet],
  );
  // The remaining (not-yet-allowed) models to add, filtered by the search box —
  // allowed models live in their own list above, so each appears once.
  const results = useMemo(() => {
    const base = catalog.filter((m) => !allowedSet.has(m.id));
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((m) => m.label.toLowerCase().includes(q));
  }, [catalog, search, allowedSet]);

  const toggle = (id: string) => {
    const next = new Set(allowedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSave([...next].sort());
  };

  const renderModel = (m: ModelCatalogEntry) => (
    <div
      key={m.id}
      className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5"
    >
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        {m.label}
      </span>
      <Switch
        aria-label={t("agentAdmin.models.allowModel", { name: m.label })}
        checked={allowedSet.has(m.id)}
        disabled={saving}
        onCheckedChange={() => toggle(m.id)}
      />
    </div>
  );

  if (allowedModels === null) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Cpu />
          </EmptyMedia>
          <EmptyTitle>{t("agentAdmin.models.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("agentAdmin.models.emptyBody")}
          </EmptyDescription>
        </EmptyHeader>
        <Button
          className="mt-2 rounded-full"
          size="sm"
          disabled={saving}
          onClick={() => onSave([])}
        >
          {t("agentAdmin.models.restrict")}
        </Button>
      </Empty>
    );
  }

  return (
    <div>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-foreground">
            {t("agentAdmin.models.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("agentAdmin.models.subtitle")}
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(null)}
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          {t("agentAdmin.models.allowAll")}
        </button>
      </header>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-foreground">
          {t("agentAdmin.models.allowedHeading")}
        </h2>
        {allowedList.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("agentAdmin.models.allowedEmpty")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allowedList.map(renderModel)}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-foreground">
          {t("agentAdmin.models.addHeading")}
        </h2>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("agentAdmin.models.searchModels")}
            className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        {results.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("agentAdmin.models.noModels")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {results.map(renderModel)}
          </div>
        )}
      </section>
    </div>
  );
}
