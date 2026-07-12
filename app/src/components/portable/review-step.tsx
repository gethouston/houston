/**
 * The share hub (final common step): a summary of what's going out, from which
 * the user either saves a file or publishes to the Agent Store. And the publish
 * success screen with the live share link.
 */

import { useTranslation } from "react-i18next";
import { ShareLink, UnlistedNote } from "./share-screen";
import { SummaryRow } from "./wizard-parts";

export function ReviewStep({
  agentName,
  counts,
  anonymized,
}: {
  agentName: string;
  counts: { skills: number; routines: number; learnings: number };
  anonymized: boolean;
}) {
  const { t } = useTranslation("portable");
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">
          {t("export.review.title")}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("export.review.body", { name: agentName })}
        </p>
      </header>

      <dl className="space-y-2 text-sm">
        <SummaryRow
          label={t("export.step3.skillsLabel")}
          value={counts.skills}
        />
        <SummaryRow
          label={t("export.step3.routinesLabel")}
          value={counts.routines}
        />
        <SummaryRow
          label={t("export.step3.learningsLabel")}
          value={counts.learnings}
        />
        <SummaryRow
          label={t("export.step3.anonymizedLabel")}
          value={anonymized ? t("export.step3.yes") : t("export.step3.no")}
        />
      </dl>
    </div>
  );
}

export function ShareStep({
  agentName,
  shareUrl,
}: {
  agentName: string;
  shareUrl: string;
}) {
  const { t } = useTranslation("portable");
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">
          {t("publish.share.title", { name: agentName })}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("publish.share.body")}
        </p>
      </header>
      <ShareLink shareUrl={shareUrl} />
      <UnlistedNote />
    </div>
  );
}
