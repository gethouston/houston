import { Button } from "@houston-ai/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCloudMigrationStore } from "../../../stores/cloud-migration";
import { DoneFollowups } from "./done-followups";
import { WizardFrame } from "./wizard-frame";

/**
 * The wizard's summary: what made it, what stayed behind (skipped-too-large
 * files from the manifests, import-rejected items, any agents the user chose
 * to continue without), then the reconnect follow-ups. Stamps the persisted
 * outcome on mount (`applyNow: false`, so a relaunch skips the wizard without
 * ripping this screen away); the final button applies it in-session.
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

  return (
    <WizardFrame
      title={t("done.title")}
      body={t("done.summary", { count: doneTasks.length })}
      footer={
        <Button
          className="rounded-full px-6"
          onClick={() => persistOutcome("done")}
        >
          {t("done.finish")}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
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
        <DoneFollowups integrations={integrations} />
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
