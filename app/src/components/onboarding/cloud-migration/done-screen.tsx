import { Button } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCloudMigrationStore } from "../../../stores/cloud-migration";
import { DoneCongrats, DoneStepAi, DoneStepApps } from "./done-followups";
import { WizardFrame } from "./wizard-frame";

type Step = "ai" | "apps" | "congrats";

/**
 * The wizard's post-migration setup (HOU-719 redesign): two setup steps in one
 * dialog, "Connect your AI" then "Reconnect your apps", then a brief congrats
 * beat (confetti payoff) before closing into the app. Also surfaces anything
 * that didn't make the move (failed agents, excluded files, rejected items) so
 * nothing is silently dropped. Stamps the persisted outcome on mount (`applyNow:
 * false`, so a relaunch skips the wizard without ripping this screen away);
 * the congrats step's button applies it in-session.
 */
export function DoneScreen({
  persistOutcome,
}: {
  persistOutcome: (
    outcome: "done" | "skipped",
    opts?: { applyNow?: boolean },
  ) => void;
}) {
  const { t } = useTranslation("migration");
  const [step, setStep] = useState<Step>("ai");
  const tasks = useCloudMigrationStore((s) => s.tasks);
  const progress = useCloudMigrationStore((s) => s.progress);
  const integrations = useCloudMigrationStore((s) => s.integrations);

  useEffect(() => {
    persistOutcome("done", { applyNow: false });
  }, [persistOutcome]);

  const doneTasks = tasks.filter((x) => progress[x.sourceId]?.step === "done");
  const failedTasks = tasks.filter(
    (x) => progress[x.sourceId]?.step !== "done",
  );
  const excluded = doneTasks.flatMap((x) =>
    x.manifest.excluded.map((e) => e.path),
  );
  const rejected = doneTasks.flatMap(
    (x) => progress[x.sourceId]?.rejected ?? [],
  );

  if (step === "congrats") {
    return <DoneCongrats onFinish={() => persistOutcome("done")} />;
  }

  if (step === "ai") {
    return (
      <WizardFrame
        eyebrow={t("done.stepAi")}
        title={t("done.reconnectAiTitle")}
        body={t("done.reconnectAiBody")}
        footer={
          <>
            <Button
              className="rounded-full px-6"
              onClick={() => setStep("apps")}
            >
              {t("done.continue")}
            </Button>
            <button
              type="button"
              onClick={() => setStep("apps")}
              className="rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("offer.startFresh")}
            </button>
          </>
        }
      >
        <DoneStepAi />
      </WizardFrame>
    );
  }

  return (
    <WizardFrame
      eyebrow={t("done.stepApps")}
      title={t("done.reconnectAppsTitle")}
      body={t("done.reconnectAppsBody")}
      footer={
        <>
          <Button
            className="rounded-full px-6"
            onClick={() => setStep("congrats")}
          >
            {t("done.finish")}
          </Button>
          <button
            type="button"
            onClick={() => setStep("ai")}
            className="rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("done.back")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <DoneStepApps integrations={integrations} />
        {failedTasks.length > 0 && (
          <LeftoverList
            title={t("done.leftBehindTitle")}
            body={t("done.leftBehindBody")}
            items={failedTasks.map((x) => x.agent)}
          />
        )}
        {excluded.length > 0 && (
          <LeftoverList title={t("done.excludedTitle")} items={excluded} />
        )}
        {rejected.length > 0 && (
          <LeftoverList
            title={t("done.rejectedTitle")}
            items={rejected.map((r) => r.path)}
          />
        )}
      </div>
    </WizardFrame>
  );
}

function LeftoverList({
  title,
  body,
  items,
}: {
  title: string;
  body?: string;
  items: string[];
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      {body && <p className="mt-1 text-xs text-muted-foreground">{body}</p>}
      <ul className="mt-2 max-h-32 overflow-y-auto rounded-xl bg-secondary px-4 py-2.5">
        {items.map((item) => (
          <li
            key={item}
            className="truncate py-0.5 text-xs text-muted-foreground"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
