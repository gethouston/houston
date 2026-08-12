import { Button } from "@houston-ai/core";
import { UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHero } from "../shell/page-shell";

export function AgentSettingsPeopleHero({
  titleId,
  showShare,
  onShare,
}: {
  titleId: string;
  showShare: boolean;
  onShare: () => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <PageHero
      level={2}
      titleId={titleId}
      className="mb-4"
      title={t("agentAdmin.heroes.people")}
      subtitle={t("agentSettings.people.helper")}
      trailing={
        showShare ? (
          <Button
            variant="secondary"
            className="shrink-0 rounded-full"
            onClick={onShare}
          >
            <UserPlus className="size-4" />
            {t("share.button")}
          </Button>
        ) : undefined
      }
    />
  );
}
