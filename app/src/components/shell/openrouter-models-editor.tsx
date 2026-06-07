import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Spinner } from "@houston-ai/core";
import {
  filterOpenRouterCatalog,
  mergeOpenRouterSlugSelection,
  resolveRecommendedSlugs,
} from "../../lib/openrouter-catalog";
import { loadOpenRouterModelSlugs, saveOpenRouterModelSlugs } from "../../lib/openrouter-models-prefs";
import { useOpenRouterCatalog } from "../../hooks/use-openrouter-catalog";
import { useInvalidateOpenRouterModels } from "../../hooks/use-openrouter-models";
import { useUIStore } from "../../stores/ui";
import { OpenRouterModelAddPanel } from "./openrouter-model-add-panel";
import type { OpenRouterModelsEditorActions } from "../../lib/openrouter-models-editor-sync";

export type { OpenRouterModelsEditorActions };

interface EditorProps {
  showHeader?: boolean;
  onSaved?: () => void;
  onActionsReady?: (actions: OpenRouterModelsEditorActions | null) => void;
}

export function OpenRouterModelsEditor({ showHeader = true, onSaved, onActionsReady }: EditorProps) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const invalidateModels = useInvalidateOpenRouterModels();
  const { data: catalog = [], isLoading: catalogLoading, isError, error } = useOpenRouterCatalog();
  const [slugsLoading, setSlugsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const onSavedRef = useRef(onSaved);
  const onActionsReadyRef = useRef(onActionsReady);
  const selectedRef = useRef(selected);
  const savingRef = useRef(saving);
  const publishedRef = useRef<{ canFinish: boolean; saving: boolean } | null>(null);
  const catalogErrorShownRef = useRef(false);

  onSavedRef.current = onSaved;
  onActionsReadyRef.current = onActionsReady;
  selectedRef.current = selected;
  savingRef.current = saving;

  const loading = catalogLoading || slugsLoading;

  useEffect(() => {
    let cancelled = false;
    void loadOpenRouterModelSlugs()
      .then((slugs) => {
        if (!cancelled) setSelected(slugs);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        addToast({
          title: t("openrouterConnect.catalogFailed"),
          description: msg,
          variant: "error",
        });
      })
      .finally(() => {
        if (!cancelled) setSlugsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addToast, t]);

  useEffect(() => {
    if (!isError || catalogErrorShownRef.current) return;
    catalogErrorShownRef.current = true;
    const msg = error instanceof Error ? error.message : String(error ?? "");
    addToast({
      title: t("openrouterConnect.catalogFailed"),
      description: msg,
      variant: "error",
    });
  }, [addToast, error, isError, t]);

  const onFinishStable = useCallback(() => {
    void (async () => {
      if (selectedRef.current.length === 0 || savingRef.current) return;
      setSaving(true);
      try {
        await saveOpenRouterModelSlugs(selectedRef.current);
        invalidateModels();
        onSavedRef.current?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast({
          title: t("openrouterConnect.saveModelsFailed"),
          description: msg,
          variant: "error",
        });
      } finally {
        setSaving(false);
      }
    })();
  }, [addToast, invalidateModels, t]);

  useEffect(() => {
    const publish = onActionsReadyRef.current;
    if (!publish) return;

    if (loading) {
      if (publishedRef.current !== null) {
        publishedRef.current = null;
        publish(null);
      }
      return;
    }

    const canFinish = selected.length > 0;
    const prev = publishedRef.current;
    if (prev?.canFinish === canFinish && prev?.saving === saving) return;

    publishedRef.current = { canFinish, saving };
    publish({ canFinish, saving, onFinish: onFinishStable });
  }, [loading, onFinishStable, saving, selected.length]);

  const catalogById = useMemo(
    () => new Map(catalog.map((m) => [m.id, m] as const)),
    [catalog],
  );

  const filtered = useMemo(
    () => filterOpenRouterCatalog(catalog, query).slice(0, 40),
    [catalog, query],
  );

  const selectedEntries = useMemo(
    () =>
      selected.map((id) => {
        const hit = catalogById.get(id);
        return hit ?? {
          id,
          name: id.split("/").pop()?.replace(/-/g, " ") ?? id,
          description: "",
          isFree: id.endsWith(":free"),
        };
      }),
    [catalogById, selected],
  );

  const addModel = (id: string) => {
    setSelected((prev) => mergeOpenRouterSlugSelection(prev, [id]));
    setQuery("");
  };

  const applyRecommended = (kind: "free" | "paid") => {
    setSelected((prev) => mergeOpenRouterSlugSelection(prev, resolveRecommendedSlugs(catalog, kind)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
        <Spinner className="size-4" />
        {t("openrouterConnect.loadingCatalog")}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {showHeader ? (
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-foreground">{t("openrouterConnect.modelsTitle")}</p>
          <p className="text-[12px] leading-snug text-muted-foreground">
            {t("openrouterConnect.modelsDescription")}
          </p>
        </div>
      ) : null}

      {selectedEntries.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-black/5 bg-background">
          {selectedEntries.map((m) => (
            <li key={m.id} className="flex min-w-0 items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{m.name}</p>
              </div>
              {m.isFree ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {t("openrouterConnect.freeBadge")}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setSelected((prev) => prev.filter((id) => id !== m.id))}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("openrouterConnect.removeModel", { name: m.name })}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted-foreground">{t("openrouterConnect.noSelectedModels")}</p>
      )}

      <OpenRouterModelAddPanel
        filtered={filtered}
        query={query}
        onQueryChange={setQuery}
        onAddModel={addModel}
        onAddRecommended={applyRecommended}
      />
    </div>
  );
}
