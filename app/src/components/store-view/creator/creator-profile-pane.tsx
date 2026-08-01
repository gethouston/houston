import { Button } from "@houston-ai/core";
import type { StoreCatalogAgent } from "@houston-ai/engine-client";
import {
  reportStoreCreator,
  StoreCatalogError,
} from "@houston-ai/engine-client";
import { CreatorProfileScreen } from "@houston-ai/store";
import { FlagIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { showErrorToast } from "../../../lib/error-toast";
import { ReportDialog } from "../report-dialog";
import { actionLink } from "../store-link";
import { agentCardLabels } from "../store-shared-labels";
import { useStoreInstall } from "../use-store-install";
import { CreatorSocials } from "./creator-socials";
import { useCreatorAgents } from "./use-creator-agents";

export function CreatorProfilePane({
  handle,
  onOpenAgent,
}: {
  handle: string;
  onOpenAgent: (agent: StoreCatalogAgent) => void;
}) {
  const { t } = useTranslation("store");
  const result = useCreatorAgents(handle);
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => {
    if (result.error) {
      showErrorToast(
        "store_creator",
        `creator profile fetch failed (${handle})`,
        result.error,
        {
          userMessage: t("creator.loadFailed"),
        },
      );
    }
  }, [result.error, handle, t]);
  const { install } = useStoreInstall();
  const LinkComponent = actionLink((href) => {
    const agent = result.items.find((item) => `agent:${item.id}` === href);
    if (agent) onOpenAgent(agent);
  });
  const notFound =
    result.error instanceof StoreCatalogError && result.error.status === 404;
  const profile = result.profile;
  return (
    <div className="flex flex-col gap-10">
      <CreatorProfileScreen
        onTryAgent={(agent) => {
          if (agent.slug) void install(agent.slug);
        }}
        profile={profile}
        agents={result.items}
        agentHref={(agent) => `agent:${agent.id}`}
        LinkComponent={LinkComponent}
        agentCardLabels={agentCardLabels(t)}
        loading={result.isPending}
        failed={result.isError || !profile}
        onRetry={notFound ? undefined : result.retry}
        socialLinks={
          profile ? (
            <div className="mt-2.5 flex items-center gap-2">
              <CreatorSocials links={profile.links} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReportOpen(true)}
                className="text-ink-muted"
              >
                <FlagIcon className="size-4" />
                {t("creator.report")}
              </Button>
            </div>
          ) : undefined
        }
        pagination={
          result.hasMore ? (
            <Button
              variant="outline"
              className="self-center rounded-full"
              disabled={result.isFetchingMore}
              onClick={result.showMore}
            >
              {t("showMore")}
            </Button>
          ) : null
        }
        labels={{
          agents: t("browse.agents"),
          agent: t("shared.agent"),
          agentsNoun: t("shared.agents"),
          install: t("analytics.totalInstalls_one", { count: 1 }).replace(
            "1 ",
            "",
          ),
          installs: t("shared.installs"),
          noAgents: t("creator.noAgents"),
          loadFailed: notFound
            ? t("creator.notFound")
            : t("creator.loadFailed"),
          retry: t("retry"),
        }}
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
