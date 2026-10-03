/**
 * RoutineAutoPauseBanner — the routine screen's notice for a routine the
 * engine paused by itself after its runs kept failing on the same account or
 * model problem. It names the problem and the one fix (the SDK's
 * `routinePauseNotice` decides which), and offers Resume. Renders nothing for
 * a running routine or one a person paused.
 */

import type { Routine } from "@houston/engine-adapter";
import {
  type RoutinePauseNotice,
  type RoutineReaderAccount,
  routinePauseNotice,
} from "@houston/sdk";
import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { providerName } from "../../lib/providers";

interface Props {
  routine: Routine;
  onResume: () => void;
  resuming: boolean;
  /** The reader's own account for a provider (`useRoutineReader`). */
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
    pause ? readerFor(pause.provider) : undefined,
  );
  if (!notice) return null;

  // Spelled out per remedy rather than built from it: `t()` keys are typed, so
  // a template-literal key would compile past a typo the validator can't see.
  const body = (n: RoutinePauseNotice): string => {
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
    }
  };

  return (
    <div
      role="status"
      data-testid="routine-auto-pause-banner"
      className="mx-auto mb-6 flex w-full max-w-3xl flex-col gap-3 rounded-lg border border-line bg-card px-4 py-3 md:flex-row md:items-center md:gap-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-warning"
          />
          {t("details.autoPause.title", { count: notice.failures })}
        </p>
        <p className="text-sm text-ink-muted">{body(notice)}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="self-start md:self-center"
        disabled={resuming}
        onClick={onResume}
      >
        {t("details.autoPause.resume")}
      </Button>
    </div>
  );
}
