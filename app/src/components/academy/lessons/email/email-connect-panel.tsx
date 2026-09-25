import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../../../hooks/use-capabilities";
import { INTEGRATION_PROVIDER } from "../../../integrations/model";
import type { LessonPanelProps } from "../lesson-panel";
import { LessonPanelFrame } from "../lesson-panel-frame";
import { EmailConnectList } from "./email-connect-list";
import { EmailPanelLoading } from "./email-panel-loading";

/**
 * Connect the email the AI Employee sends from.
 *
 * The panel never moves the lesson on itself: the beat waits on an active
 * email connection (`integrationConnected`), so a connection made here, on
 * the Integrations screen or in another window all end it the same way.
 *
 * The path only offers the lesson where the integrations are served
 * (`lesson-availability.ts`), so "unavailable" is the rare deployment that
 * stopped serving them mid-lesson; while the capabilities load, the panel
 * waits rather than flash it.
 */
export function EmailConnectPanel({ copy }: LessonPanelProps) {
  const { t } = useTranslation("academy");
  const { capabilities, isLoading } = useCapabilities();
  const available =
    capabilities?.integrations.includes(INTEGRATION_PROVIDER) ?? false;

  return (
    <LessonPanelFrame title={copy.title} body={copy.body}>
      {isLoading ? (
        <EmailPanelLoading
          label={t("lessons.employee-email.steps.connect.loading")}
        />
      ) : available ? (
        <EmailConnectList />
      ) : (
        <p className="text-sm text-balance text-ink-muted">
          {t("lessons.employee-email.steps.connect.unavailable")}
        </p>
      )}
    </LessonPanelFrame>
  );
}
