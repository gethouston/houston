import type { Routine } from "@houston/engine-adapter";
import {
  type RoutinePauseNotice,
  type RoutineReaderAccount,
  routinePauseNotice,
} from "@houston/sdk";
import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { providerName } from "../../lib/providers";
import { RoutineNoticeCard } from "./routine-notice-card";

interface Props {
  routine: Routine;
  onResume: () => void;
  resuming: boolean;
  readerFor: (provider: string) => RoutineReaderAccount;
}

export function RoutineAutoPauseBanner({
  routine,
  onResume,
  resuming,
  readerFor,
}: Props) {
  const { t } = useTranslation("routines");
  const pause = routine.auto_paused;
  const notice = routinePauseNotice(
    routine,
    pause && !pause.cause ? readerFor(pause.provider) : undefined,
  );
  if (!notice) return null;

  const body = (n: RoutinePauseNotice): string => {
    if (n.remedy === "choose_model") return t("details.autoPause.chooseModel");
    const provider = providerName(n.provider);
    switch (n.remedy) {
      case "connect_account":
        return n.account === "team"
          ? t("details.autoPause.connectTeam", { provider })
          : t("details.autoPause.connectCreator", { provider });
      case "reconnect_account":
        return n.account === "team"
          ? t("details.autoPause.reconnectTeam", { provider })
          : t("details.autoPause.reconnectCreator", { provider });
      case "add_credits":
        return t("details.autoPause.addCredits", { provider });
      case "change_model":
        return t("details.autoPause.changeModel", { provider });
      case "check_runs":
        return t("details.autoPause.keepsFailing", { provider });
    }
  };

  return (
    <RoutineNoticeCard
      data-testid="routine-auto-pause-banner"
      tone="warning"
      heading={t("details.autoPause.title", { count: notice.failures })}
      body={body(notice)}
      className="mx-auto mb-6 max-w-3xl"
      actions={
        <Button
          variant="secondary"
          size="sm"
          className="active:scale-[0.96]"
          disabled={resuming}
          onClick={onResume}
        >
          {t("details.autoPause.resume")}
        </Button>
      }
    />
  );
}
