import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import type { RecommendStackResponse, StackEntry } from "@houston-ai/engine-client";
import { tauriConnections, tauriSystem } from "../../lib/tauri";
import { useComposioRefetchOnReturn } from "../../hooks/use-composio-refetch-on-return";

interface StackDiscoverPanelProps {
  connectedToolkits: Set<string>;
}

/**
 * Plain-language "describe what you want to do" entry point sitting on
 * top of the raw Composio catalog. Calls /v1/composio/recommend with
 * the user's intent, renders the curated stack inline. End users never
 * need to browse 1000 toolkits — the engine + LLM curate the right 3-6
 * for the goal.
 */
export function StackDiscoverPanel({ connectedToolkits }: StackDiscoverPanelProps) {
  const { t } = useTranslation("integrations");
  const [intent, setIntent] = useState("");
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const markWaitingForAuth = useComposioRefetchOnReturn();

  const recommend = useMutation({
    mutationFn: async (goal: string) => {
      const result = await tauriConnections.recommendStack(
        goal,
        Array.from(connectedToolkits),
      );
      return result;
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = intent.trim();
      if (trimmed.length === 0 || recommend.isPending) return;
      recommend.mutate(trimmed);
    },
    [intent, recommend],
  );

  const handleConnect = useCallback(
    async (toolkit: string) => {
      setConnectingSlug(toolkit);
      try {
        const { redirect_url } = await tauriConnections.connectApp(toolkit);
        tauriSystem.openUrl(redirect_url);
        markWaitingForAuth(toolkit);
      } finally {
        setConnectingSlug(null);
      }
    },
    [markWaitingForAuth],
  );

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Sparkles className="size-4 text-violet-500" />
          {t("discover.title")}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{t("discover.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder={t("discover.placeholder")}
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
          disabled={recommend.isPending}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={intent.trim().length === 0 || recommend.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-200"
          >
            {recommend.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t("discover.thinking")}
              </>
            ) : (
              <>
                {t("discover.submit")}
                <ArrowRight className="size-3.5" />
              </>
            )}
          </button>
        </div>
      </form>

      {recommend.isError && (
        <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2.5">
          <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
          <span>{t("discover.error")}</span>
        </div>
      )}

      {recommend.data && (
        <StackResult
          data={recommend.data}
          connectingSlug={connectingSlug}
          onConnect={handleConnect}
        />
      )}
    </section>
  );
}

function StackResult({
  data,
  connectingSlug,
  onConnect,
}: {
  data: RecommendStackResponse;
  connectingSlug: string | null;
  onConnect: (toolkit: string) => void;
}) {
  const { t } = useTranslation("integrations");

  if (data.primaryStack.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground py-3 text-center">
        {t("discover.empty")}
      </p>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {!data.llmPicked && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("discover.fallbackNote")}
        </p>
      )}

      <div className="space-y-2">
        {data.primaryStack.map((entry) => (
          <RecommendedEntryCard
            key={entry.toolkit}
            entry={entry}
            alternatives={data.alternatives[entry.toolkit] ?? []}
            connecting={connectingSlug === entry.toolkit}
            onConnect={onConnect}
          />
        ))}
      </div>

      {data.missingCapabilities.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300/40 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-300">
            {t("discover.missingTitle")}
          </p>
          <ul className="mt-1 list-disc list-inside text-xs text-amber-800 dark:text-amber-200/80 space-y-0.5">
            {data.missingCapabilities.map((cap, i) => (
              <li key={i}>{cap}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RecommendedEntryCard({
  entry,
  alternatives,
  connecting,
  onConnect,
}: {
  entry: StackEntry;
  alternatives: string[];
  connecting: boolean;
  onConnect: (toolkit: string) => void;
}) {
  const { t } = useTranslation("integrations");
  const [imgError, setImgError] = useState(false);
  const initial = entry.name.charAt(0).toUpperCase();

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3.5">
      <div className="flex-shrink-0 size-10 rounded-lg bg-secondary flex items-center justify-center overflow-hidden">
        {!imgError && entry.logoUrl ? (
          <img
            src={entry.logoUrl}
            alt={entry.name}
            className="size-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-base font-medium text-muted-foreground">{initial}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{entry.name}</span>
          <span className="text-[10px] uppercase tracking-wide text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/40 px-1.5 py-0.5 rounded">
            {entry.role}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          {entry.reason}
        </p>
        {alternatives.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {t("discover.altPrefix")} {alternatives.join(", ")}
          </p>
        )}
      </div>

      <div className="flex-shrink-0">
        {entry.connected ? (
          <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
            {t("discover.alreadyConnected")}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onConnect(entry.toolkit)}
            disabled={connecting}
            className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-border bg-background text-foreground text-xs font-medium hover:bg-secondary disabled:opacity-50 transition-colors duration-200"
          >
            {connecting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              t("discover.connect")
            )}
          </button>
        )}
      </div>
    </div>
  );
}
