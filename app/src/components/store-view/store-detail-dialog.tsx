import { Badge, Button, CatalogDetailDialog, Spinner } from "@houston-ai/core";
import type { StoreCatalogAgent } from "@houston-ai/engine-client";
import { fetchStoreAgent } from "@houston-ai/engine-client";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  isStoreCategory,
  storeCategoryLabelKey,
} from "../../lib/store-categories";
import { StoreAgentIcon } from "./store-agent-icon";

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
  const slug = agent?.slug ?? null;

  const detail = useQuery({
    queryKey: ["store-agent", slug],
    queryFn: () => fetchStoreAgent(slug ?? ""),
    enabled: slug !== null,
    staleTime: 60_000,
  });

  if (!agent || !slug) return null;

  const skills = detail.data?.ir.skills ?? [];
  const learnings = detail.data?.ir.learnings ?? [];
  const categoryLabel = isStoreCategory(agent.category)
    ? tPortable(storeCategoryLabelKey(agent.category))
    : agent.category;

  return (
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
        <Button
          onClick={() => onInstall(slug)}
          disabled={installing}
          className="rounded-full"
        >
          {installing && <Spinner className="size-4" />}
          {t("install")}
        </Button>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-ink-muted">
          {t("detail.by", { name: agent.creator.displayName })}
          {" · "}
          {t("installs", { count: agent.installsCount })}
        </p>
        {skills.length > 0 && (
          <div>
            <p className="mb-1.5 font-medium text-ink">{t("detail.skills")}</p>
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
            <div className="flex flex-wrap gap-1.5">
              {agent.integrations.map((toolkit) => (
                <Badge key={toolkit} variant="outline">
                  {toolkit.toLowerCase()}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {learnings.length > 0 && (
          <p className="text-ink-muted">
            {t("detail.learnings", { count: learnings.length })}
          </p>
        )}
      </div>
    </CatalogDetailDialog>
  );
}
