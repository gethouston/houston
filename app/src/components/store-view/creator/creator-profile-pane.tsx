import { Button, Spinner } from "@houston-ai/core";
import type { StoreCatalogAgent } from "@houston-ai/engine-client";
import {
  reportStoreCreator,
  StoreCatalogError,
} from "@houston-ai/engine-client";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { reportError } from "../../../lib/error-toast";
import { ReportDialog } from "../report-dialog";
import { StoreCatalogResults } from "../store-catalog-results";
import { StoreDetailDialog } from "../store-detail-dialog";
import { useStoreInstall } from "../use-store-install";
import { CreatorProfileHeader } from "./creator-profile-header";
import { useCreatorAgents } from "./use-creator-agents";

/**
 * A creator's public profile pane: their identity header (avatar, name, verified
 * badge, bio, social links) over a grid of their public agents with the same
 * one-click install and detail dialog as Browse. Self-contained — it fetches
 * through {@link useCreatorAgents} and reads/writes the ui store directly, so a
 * caller only supplies the handle and a way back. Works signed out (a shared
 * `/@handle` link or an `houston://store/creator` deep link).
 */
export function CreatorProfilePane({
  handle,
  onBack,
}: {
  handle: string;
  onBack: () => void;
}) {
  const { t } = useTranslation("store");
  const {
    profile,
    items,
    isPending,
    isError,
    error,
    hasMore,
    isFetchingMore,
    showMore,
    retry,
  } = useCreatorAgents(handle);
  const { install, installingSlug } = useStoreInstall();
  const [reportOpen, setReportOpen] = useState(false);
  const [detailAgent, setDetailAgent] = useState<StoreCatalogAgent | null>(
    null,
  );

  // A user-initiated profile load must never fail silently: even though the pane
  // renders a visible error state, the reason still reaches Sentry (same path as
  // the sibling store detail fetch).
  useEffect(() => {
    if (error) {
      reportError(
        "store_creator",
        `creator profile fetch failed (${handle})`,
        error,
      );
    }
  }, [error, handle]);

  const handleInstall = async (slug: string) => {
    const opened = await install(slug);
    if (opened) setDetailAgent(null);
  };

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={onBack}
      className="-ml-2 text-ink-muted"
    >
      <ArrowLeft className="size-4" />
      {t("creator.back")}
    </Button>
  );

  if (isPending) {
    return (
      <div className="space-y-6">
        {backButton}
        <div className="flex justify-center py-16">
          <Spinner className="size-5 text-ink-muted" />
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    const notFound = error instanceof StoreCatalogError && error.status === 404;
    return (
      <div className="space-y-6">
        {backButton}
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm text-ink-muted">
            {notFound ? t("creator.notFound") : t("creator.loadFailed")}
          </p>
          {notFound ? null : (
            <Button variant="outline" className="rounded-full" onClick={retry}>
              {t("retry")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {backButton}
      <CreatorProfileHeader
        profile={profile}
        agentCount={items.length}
        onReport={() => setReportOpen(true)}
      />
      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-muted">
          {t("creator.noAgents")}
        </p>
      ) : (
        <StoreCatalogResults
          items={items}
          isPending={false}
          isError={false}
          hasNextPage={hasMore}
          isFetchingNextPage={isFetchingMore}
          installingSlug={installingSlug}
          onRetry={retry}
          onShowMore={showMore}
          onInstall={handleInstall}
          onOpenDetail={setDetailAgent}
        />
      )}
      <StoreDetailDialog
        agent={detailAgent}
        onClose={() => setDetailAgent(null)}
        onInstall={handleInstall}
        installing={installingSlug !== null}
      />
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        errorScope="creator_report"
        onSubmit={(input) => reportStoreCreator(handle, input)}
      />
    </div>
  );
}
