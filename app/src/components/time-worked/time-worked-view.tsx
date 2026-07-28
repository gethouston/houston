import { useTranslation } from "react-i18next";
import { BackBarScreen } from "../shell/back-bar-screen";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { ComputeSection } from "./compute-section";

/**
 * The Time worked screen (Settings > Time worked): how long this user's agents
 * actually spent working, per day and per agent. Only the hosted cloud meters
 * that, so the section rides `capabilities.computeUsage` (`showTimeWorked` in
 * `useSurfaceGates`) — the Settings index hides the row and the section gate
 * blocks a stale deep link everywhere else, so this screen never opens empty.
 *
 * Per-AI-account usage is NOT here: an account and how much of it is left are
 * one thing, so they live together on the AI Models hub's Connected rows
 * (HOU-789).
 *
 * A settings section since HOU-788, so the caller owns the way back:
 * `onBack`/`backLabel` name the level above.
 */
export function TimeWorkedView({
  backLabel,
  onBack,
}: {
  backLabel: string;
  onBack: () => void;
}) {
  const { t } = useTranslation("aiHub");
  return (
    <BackBarScreen backLabel={backLabel} onBack={onBack}>
      <PageContainer className="flex flex-col gap-6 pb-10">
        <PageHeader
          title={t("timeWorked.title")}
          subtitle={t("timeWorked.subtitle")}
        />
        <ComputeSection />
      </PageContainer>
    </BackBarScreen>
  );
}
