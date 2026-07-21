import { Badge, Button, CatalogDetailDialog, Spinner } from "@houston-ai/core";
import type { StoreCatalogAgent } from "@houston-ai/engine-client";
import { fetchStoreAgent } from "@houston-ai/engine-client";
import { useQuery } from "@tanstack/react-query";
import { FlagIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { reportError } from "../../lib/error-toast";
import {
  isStoreCategory,
  storeCategoryLabelKey,
} from "../../lib/store-categories";
import { useUIStore } from "../../stores/ui";
import { AppLogo, appDisplay, useToolkitBySlug } from "../integrations";
import { CreatorChip } from "./creator/creator-chip";
import { StoreAgentIcon } from "./store-agent-icon";
import { StoreReportDialog } from "./store-report-dialog";

/**
 * A listing's "more info" modal — the catalog family's detail surface. The
 * summary renders immediately from the row's data; the IR extras (skills,
 * learnings) stream in from the detail endpoint. The footer CTA is the same
 * one-click install the row's `+` runs.
 */
export function StoreDetailDialog({
  agent,
  onClose,
  onInstall,
  installing,
}: {
  agent: StoreCatalogAgent | null;
  onClose: () => void;
  onInstall: (slug: string) => void;
  installing: boolean;
}) {
  const { t } = useTranslation("store");
  const { t: tPortable } = useTranslation("portable");
  const setStoreCreatorHandle = useUIStore((s) => s.setStoreCreatorHandle);
  const [reportOpen, setReportOpen] = useState(false);
  const slug = agent?.slug ?? null;

  // Opening a creator's public pane replaces the detail dialog: close this
  // surface, then hand the handle to the one-shot ui-store deep link the store
  // view consumes to swap in the creator pane.
  const handleOpenCreator = (handle: string) => {
    onClose();
    setStoreCreatorHandle(handle);
  };

  const detail = useQuery({
    queryKey: ["store-agent", slug],
    queryFn: () => fetchStoreAgent(slug ?? ""),
    enabled: slug !== null,
    staleTime: 60_000,
  });

  // The IR enrichment degrades gracefully (skills/learnings just don't render),
  // so a toast would be noise, but the failure must still reach Sentry: a
  // user-initiated fetch never fails silently. Same path as the sibling
  // category fetch in store-filters.tsx.
  useEffect(() => {
    if (detail.error) {
      reportError(
        "store_detail",
        `store agent detail fetch failed (${slug})`,
        detail.error,
      );
    }
  }, [detail.error, slug]);

  if (!agent || !slug) return null;

  const skills = detail.data?.ir.skills ?? [];
  const learnings = detail.data?.ir.learnings ?? [];
  const categoryLabel = isStoreCategory(agent.category)
    ? tPortable(storeCategoryLabelKey(agent.category))
    : agent.category;

  return (
    <>
      <CatalogDetailDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        icon={<StoreAgentIcon agent={agent} />}
        title={agent.name}
        tags={
          <>
            <Badge variant="secondary">{categoryLabel}</Badge>
            {agent.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </>
        }
        description={agent.description}
        action={
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReportOpen(true)}
              className="text-ink-muted"
            >
              <FlagIcon className="size-4" />
              {t("report.open")}
            </Button>
            <Button
              onClick={() => onInstall(slug)}
              disabled={installing}
              className="rounded-full"
            >
              {installing && <Spinner className="size-4" />}
              {t("install")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
            <CreatorChip creator={agent.creator} onOpen={handleOpenCreator} />
            <span aria-hidden>·</span>
            <span>{t("installs", { count: agent.installsCount })}</span>
          </div>
          {skills.length > 0 && (
            <div>
              <p className="mb-1.5 font-medium text-ink">
                {t("detail.skills")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <Badge key={skill.slug} variant="outline">
                    {skill.slug}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {agent.integrations.length > 0 && (
            <div>
              <p className="mb-1.5 font-medium text-ink">
                {t("detail.integrations")}
              </p>
              <IntegrationBadges toolkits={agent.integrations} />
            </div>
          )}
          {learnings.length > 0 && (
            <p className="text-ink-muted">
              {t("detail.learnings", { count: learnings.length })}
            </p>
          )}
        </div>
      </CatalogDetailDialog>
      {slug && (
        <StoreReportDialog
          slug={slug}
          open={reportOpen}
          onOpenChange={setReportOpen}
        />
      )}
    </>
  );
}

/**
 * The "works with" apps, resolved to real names and logos through the Composio
 * toolkit catalog (the same `appDisplay` path the Integrations tab uses) so the
 * detail dialog never shows a machine slug. While the catalog hasn't loaded, or
 * on a deployment with no integration provider wired, `appDisplay` degrades to
 * a favicon guess and the slug as its name.
 */
function IntegrationBadges({ toolkits }: { toolkits: string[] }) {
  const bySlug = useToolkitBySlug();

  return (
    <div className="flex flex-wrap gap-1.5">
      {toolkits.map((toolkit) => {
        const slug = toolkit.toLowerCase();
        const display = appDisplay(slug, bySlug.get(slug));
        return (
          <Badge
            key={toolkit}
            variant="outline"
            className="gap-1.5 py-0.5 pl-1"
          >
            <AppLogo display={display} size="sm" className="size-4" />
            {display.name}
          </Badge>
        );
      })}
    </div>
  );
}
