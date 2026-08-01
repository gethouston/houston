import { Button, Spinner } from "@houston-ai/core";
import {
  fetchStoreAgent,
  fetchStoreCreator,
  type StoreCatalogAgent,
} from "@houston-ai/engine-client";
import { AgentDetailScreen, CreatorBlock, SkillList } from "@houston-ai/store";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { showErrorToast } from "../../lib/error-toast";
import { StoreDetailFooter } from "./store-detail-footer";
import { actionLink } from "./store-link";
import { StoreMarkdown } from "./store-markdown";
import { agentCardLabels } from "./store-shared-labels";
import { useStoreInstall } from "./use-store-install";

export function StoreDetailPane({
  agent,
  onOpenAgent,
  onOpenCreator,
}: {
  agent: StoreCatalogAgent;
  onOpenAgent: (agent: StoreCatalogAgent) => void;
  onOpenCreator: (handle: string) => void;
}) {
  const { t } = useTranslation("store");
  const { install, installingSlug } = useStoreInstall();
  const detail = useQuery({
    queryKey: ["store-agent", agent.slug],
    queryFn: () => fetchStoreAgent(agent.slug ?? ""),
    enabled: Boolean(agent.slug),
    staleTime: 60_000,
  });
  const creator = useQuery({
    queryKey: ["store-creator-more", agent.creator.handle],
    queryFn: () => fetchStoreCreator(agent.creator.handle ?? ""),
    enabled: Boolean(agent.creator.handle),
    staleTime: 60_000,
  });
  const fullAgent = detail.data?.agent ?? agent;
  const skills = detail.data?.ir.skills ?? [];
  const moreAgents = (creator.data?.agents.items ?? [])
    .filter((item: StoreCatalogAgent) => item.id !== agent.id)
    .slice(0, 3);
  const LinkComponent = useMemo(
    () =>
      actionLink((href) => {
        const next = moreAgents.find(
          (item: StoreCatalogAgent) => `agent:${item.id}` === href,
        );
        if (next) onOpenAgent(next);
      }),
    [moreAgents, onOpenAgent],
  );
  const queryError = detail.error ?? creator.error;
  useEffect(() => {
    if (queryError) {
      showErrorToast("store_detail", "store detail fetch failed", queryError, {
        userMessage: t("detail.loadFailed"),
      });
    }
  }, [queryError, t]);

  return (
    <div>
      <AgentDetailScreen
        agent={{
          ...fullAgent,
          learningsCount: detail.data?.ir.learnings.length,
        }}
        skills={skills}
        creator={
          <CreatorBlock
            creator={fullAgent.creator}
            fallbackName={fullAgent.creator.displayName}
            compact
            href={
              fullAgent.creator.handle
                ? `creator:${fullAgent.creator.handle}`
                : undefined
            }
            LinkComponent={actionLink((href) =>
              onOpenCreator(href.replace("creator:", "")),
            )}
            verifiedLabel={t("creator.verified")}
          />
        }
        actions={
          fullAgent.slug ? (
            <Button
              className="rounded-full"
              disabled={installingSlug !== null}
              onClick={() => void install(fullAgent.slug ?? "")}
            >
              {installingSlug ? <Spinner className="size-4" /> : null}
              {t("shared.tryNow")}
            </Button>
          ) : null
        }
        renderBio={(description) => (
          <StoreMarkdown>{description}</StoreMarkdown>
        )}
        renderSkills={(items) => (
          <SkillList
            skills={items}
            renderContent={(content) => (
              <StoreMarkdown>{content}</StoreMarkdown>
            )}
            labels={{
              viewMore: (count) => t("detail.viewMoreSkills", { count }),
            }}
          />
        )}
        moreAgents={moreAgents}
        agentHref={(item) => `agent:${item.id}`}
        LinkComponent={LinkComponent}
        agentCardLabels={agentCardLabels(t)}
        loading={detail.isPending}
        failed={detail.isError}
        onRetry={() => void detail.refetch()}
        footer={
          fullAgent.slug ? (
            <StoreDetailFooter
              slug={fullAgent.slug}
              detailFailed={detail.isError}
            />
          ) : null
        }
        labels={{
          newAgent: t("shared.newAgent"),
          installs: t("shared.installs"),
          bio: t("detail.bio"),
          skills: t("detail.skills"),
          worksWith: t("detail.integrations"),
          learning: t("detail.learningNoun"),
          learnings: t("detail.learningsNoun"),
          moreFrom: t("detail.moreFrom"),
          carries: t("detail.carries"),
          loadFailed: t("detail.loadFailed"),
          retry: t("retry"),
        }}
      />
    </div>
  );
}
