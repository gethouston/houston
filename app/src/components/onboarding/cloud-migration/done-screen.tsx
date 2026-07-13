import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCloudMigrationStore } from "../../../stores/cloud-migration";
import { SetupCard } from "../setup-card";
import { DoneCongrats, DoneStepAi, DoneStepApps } from "./done-followups";

type Step = "ai" | "apps" | "congrats";

/**
 * The wizard's post-migration setup (HOU-719 redesign): two setup steps,
 * "Connect your AI" then "Reconnect your apps", each a floating `SetupCard`
 * on the shared space backdrop (the same card onboarding uses, so the two
 * flows read as one voice), then a brief congrats beat (confetti payoff)
 * before closing into the app. Also surfaces anything that didn't make the
 * move (failed agents, excluded files, rejected items) so nothing is silently
 * dropped. Stamps the persisted outcome on mount (`applyNow: false`, so a
 * relaunch skips the wizard without ripping this screen away); the congrats
 * step's button applies it in-session.
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
      <SetupCard
        onSpace
        eyebrow={t("done.stepAi")}
        title={t("done.reconnectAiTitle")}
        subtitle={t("done.reconnectAiBody")}
        helper={
          <button
            type="button"
            onClick={() => setStep("apps")}
            className="underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            {t("done.skip")}
          </button>
        }
        onNext={() => setStep("apps")}
        nextLabel={t("done.continue")}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DoneStepAi />
        </div>
      </SetupCard>
    );
  }

  return (
    <SetupCard
      onSpace
      eyebrow={t("done.stepApps")}
      title={t("done.reconnectAppsTitle")}
      subtitle={t("done.reconnectAppsBody")}
      onBack={() => setStep("ai")}
      backLabel={t("done.back")}
      onNext={() => setStep("congrats")}
      nextLabel={t("done.finish")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
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
    </SetupCard>
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
      {body && <p className="mt-1 text-xs text-ink-muted">{body}</p>}
      <ul className="mt-2 max-h-32 overflow-y-auto rounded-xl bg-chip px-4 py-2.5">
        {items.map((item) => (
          <li key={item} className="truncate py-0.5 text-xs text-ink-muted">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
