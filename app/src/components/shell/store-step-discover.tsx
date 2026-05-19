import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import type { RecommendStackResponse } from "@houston-ai/engine-client";
import { tauriConnections } from "../../lib/tauri";

interface Props {
  /** Slugs of toolkits already authorized in Composio. Passed to the
   *  recommender so it can mark them as connected and bias toward
   *  reuse. */
  connectedToolkits: string[];
  /** Fired whenever the user submits an intent and gets back a stack.
   *  Receives the toolkit slugs from the primary stack so the parent
   *  can re-rank agent cards. Empty array clears the highlight. */
  onStackRecommended: (toolkitSlugs: string[]) => void;
}

/**
 * Disclosure rendered at the top of StoreStep. Lets the user describe
 * their goal in plain language; calls the recommender; surfaces the
 * tool stack that goal needs. The store-step parent then re-ranks
 * agent cards so the one whose `integrations[]` best matches the
 * recommended stack floats to the top.
 *
 * Unlike the version in the Connections tab, this one does NOT offer
 * "Connect" buttons inline. Connecting happens after the agent is
 * created and opened, via the normal Composio link cards in chat or
 * the Integrations tab. Keeping it informational here avoids
 * mid-flow OAuth popups that would interrupt agent creation.
 */
export function StoreStepDiscover({
  connectedToolkits,
  onStackRecommended,
}: Props) {
  const { t } = useTranslation("shell");
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState("");

  const recommend = useMutation({
    mutationFn: async (goal: string) => {
      return tauriConnections.recommendStack(goal, connectedToolkits);
    },
    onSuccess: (data: RecommendStackResponse) => {
      onStackRecommended(data.primaryStack.map((e) => e.toolkit));
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

  return (
    <div className="mb-4 rounded-2xl border border-border bg-secondary/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/60 transition-colors duration-150"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-violet-500" />
          <span className="text-sm font-medium text-foreground">
            {t("storeDiscover.title")}
          </span>
        </div>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("storeDiscover.subtitle")}
          </p>
          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder={t("storeDiscover.placeholder")}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
              disabled={recommend.isPending}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={intent.trim().length === 0 || recommend.isPending}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-200"
              >
                {recommend.isPending ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    {t("storeDiscover.thinking")}
                  </>
                ) : (
                  t("storeDiscover.submit")
                )}
              </button>
            </div>
          </form>

          {recommend.isError && (
            <p className="text-xs text-red-600">{t("storeDiscover.error")}</p>
          )}

          {recommend.data && recommend.data.primaryStack.length > 0 && (
            <div className="rounded-lg bg-background border border-border p-3">
              <p className="text-xs font-medium text-foreground mb-2">
                {t("storeDiscover.stackLabel")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recommend.data.primaryStack.map((entry) => (
                  <span
                    key={entry.toolkit}
                    className="inline-flex items-center gap-1 text-[11px] bg-secondary text-foreground px-2 py-0.5 rounded-full"
                    title={entry.reason}
                  >
                    {entry.name}
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{entry.role}</span>
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {t("storeDiscover.rankedHint")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
