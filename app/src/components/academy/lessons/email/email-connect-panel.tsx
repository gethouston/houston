import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../../../hooks/use-capabilities";
import { INTEGRATION_PROVIDER } from "../../../integrations/model";
import type { LessonPanelProps } from "../lesson-panel";
import { LessonPanelFrame } from "../lesson-panel-frame";
import { EmailConnectList } from "./email-connect-list";
import { EmailPanelLoading } from "./email-panel-loading";

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
