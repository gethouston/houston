import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * What the industry filter offers when nothing matches: the typed words are
 * already the answer the user means, so the way out is to take them.
 */
export function SurveyIndustryNoMatches({
  query,
  onUseQuery,
}: {
  query: string;
  onUseQuery: () => void;
}) {
  const { t } = useTranslation("agentOnboarding");
  return (
    <div className="create-inline-in flex flex-col items-start gap-3">
      <p className="text-sm text-ink-muted">
        {t("roleSetup.noContextMatches")}
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={onUseQuery}>
        {t("roleSetup.useQueryAsContext", { query })}
      </Button>
    </div>
  );
}
