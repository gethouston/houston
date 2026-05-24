import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import type { TrackerConnectionList } from "@houston-ai/engine-client";

/**
 * Workspace-many informational surface (PR B).
 *
 * Renders the list of Linear connections registered to the workspace,
 * surfaced by `useTrackerConnectionList`. Today's Settings + LinearView
 * still drive their per-org disconnect/sync through the legacy
 * per-agent path (one connection at a time); this panel is the
 * first user-visible glimpse of the workspace-many shape that
 * PR A's engine foundation introduced.
 *
 * PR C will move the per-row Disconnect / Sync controls here once
 * the routes accept `orgId`.
 */
export interface LinearConnectionsPanelProps {
  data: TrackerConnectionList | undefined;
  isLoading: boolean;
  /** Hide entirely when only zero or one connection is present —
   *  the existing single-card Settings view already covers that
   *  shape, and a list of one is more noise than signal. */
  hideWhenLeOne?: boolean;
}

export function LinearConnectionsPanel({
  data,
  isLoading,
  hideWhenLeOne = true,
}: LinearConnectionsPanelProps) {
  const { t } = useTranslation(["tracker", "common"]);

  if (isLoading) return null;
  const connections = data?.connections ?? [];
  if (hideWhenLeOne && connections.length <= 1) return null;

  return (
    <section className="mt-6 border border-border rounded-lg p-4">
      <header className="flex items-center gap-2 mb-3">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          {t("linear.connections.heading", { count: connections.length })}
        </h3>
      </header>
      <p className="text-xs text-muted-foreground mb-3">
        {t("linear.connections.intro")}
      </p>
      <ul className="space-y-2">
        {connections.map((c) => (
          <li
            key={c.orgId}
            className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{c.orgName}</p>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {c.orgId}
              </p>
            </div>
            {c.capabilities.length > 0 && (
              <div className="hidden sm:flex items-center gap-1 shrink-0 ml-3">
                {c.capabilities.slice(0, 3).map((cap) => (
                  <span
                    key={cap}
                    className="inline-flex h-[18px] items-center rounded-full bg-background px-2 text-[10px] font-medium text-muted-foreground border border-border"
                  >
                    {cap}
                  </span>
                ))}
                {c.capabilities.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    {t("linear.connections.moreCaps", {
                      count: c.capabilities.length - 3,
                    })}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
