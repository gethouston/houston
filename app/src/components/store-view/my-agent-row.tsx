import { Badge, Button } from "@houston-ai/core";
import type { MyAgent } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { StoreAgentIcon } from "./store-agent-icon";
import type { RequestPublicMode } from "./store-view-model";

/** The button label for each non-hidden "request public listing" mode. */
const REQUEST_PUBLIC_LABEL: Record<
  Exclude<RequestPublicMode, "hidden">,
  string
> = {
  available: "myAgents.action.requestPublic",
  pending: "myAgents.action.requestPublicPending",
  requested: "myAgents.action.requestPublicDone",
};

/**
 * One owner-dashboard row: the same catalog grammar the browse tab leads with
 * (glyph, name, tagline, install count) plus lifecycle badges and the owner's
 * always-visible action buttons. Every affordance is a real button (no hover-
 * only reveals); which ones show follows the agent's state/visibility.
 */
export function MyAgentRow({
  agent,
  busy,
  requestPublicMode,
  onRequestPublic,
  onMakeUnlisted,
  onUnpublish,
  onDelete,
  onSeeInStore,
}: {
  agent: MyAgent;
  busy: boolean;
  requestPublicMode: RequestPublicMode;
  onRequestPublic: () => void;
  onMakeUnlisted: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  onSeeInStore: () => void;
}) {
  const { t } = useTranslation("store");
  const published = agent.state === "published";
  const isPublic = agent.visibility === "public";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <StoreAgentIcon agent={agent} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink">{agent.name}</span>
            {agent.state && (
              <Badge variant="secondary">
                {t(`myAgents.state.${agent.state}`)}
              </Badge>
            )}
            {published && agent.visibility && (
              <Badge variant="outline">
                {t(`myAgents.visibility.${agent.visibility}`)}
              </Badge>
            )}
          </div>
          {agent.tagline && (
            <p className="truncate text-sm text-ink-muted">{agent.tagline}</p>
          )}
          <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
            {t("installs", { count: agent.installsCount })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {requestPublicMode !== "hidden" && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={busy || requestPublicMode !== "available"}
            onClick={onRequestPublic}
          >
            {t(REQUEST_PUBLIC_LABEL[requestPublicMode])}
          </Button>
        )}
        {published && isPublic && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={onMakeUnlisted}
          >
            {t("myAgents.action.makeUnlisted")}
          </Button>
        )}
        {agent.slug && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={onSeeInStore}
          >
            {t("myAgents.action.seeInStore")}
          </Button>
        )}
        {published && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={onUnpublish}
          >
            {t("myAgents.action.unpublish")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onDelete}
        >
          {t("myAgents.action.delete")}
        </Button>
      </div>
    </div>
  );
}
