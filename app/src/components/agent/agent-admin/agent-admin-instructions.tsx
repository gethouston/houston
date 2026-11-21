import { parseJobDescription } from "@houston/sdk/job-description";
import { Button, Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useInstructions, useSaveInstructions } from "../../../hooks/queries";
import { useOrgWriteLock } from "../../../hooks/use-org-write-lock";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { ContextEditorBox } from "../../context/context-editor";
import { withJobBody, withJobField } from "../../context/job-brief-model";
import { JobBriefRows } from "../../context/job-brief-rows";
import { SettingsGroupTitle } from "../../settings/settings-row";
import { PageHero } from "../../shell/page-shell";

class InstructionsNotSavedError extends Error {
  override name = "InstructionsNotSavedError";
}

export function AgentAdminInstructions({ agent }: AgentSectionProps) {
  const { t } = useTranslation(["agents", "common"]);
  const path = agent.folderPath;
  const {
    data: instructions,
    isError,
    refetch,
    isFetching,
  } = useInstructions(path);
  const save = useSaveInstructions(path);
  const { locked } = useOrgWriteLock();
  const text = instructions ?? "";
  const { fields, body } = parseJobDescription(text);
  const write = (content: string) => void save(content);

  return (
    <div className="pb-2">
      <PageHero level={2} title={t("subTabs.instructions")} className="mb-6" />
      {instructions === undefined && isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-ink-muted">
            {t("instructions.loadFailed")}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => {
              void refetch();
            }}
          >
            {t("common:actions.tryAgain")}
          </Button>
        </div>
      ) : instructions === undefined ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <div className="space-y-8">
          <JobBriefRows
            industry={fields.industry}
            role={fields.role}
            onChange={(field, answer) =>
              write(withJobField(text, field, answer))
            }
          />
          <section>
            <SettingsGroupTitle>
              {t("instructions.specific")}
            </SettingsGroupTitle>
            <ContextEditorBox
              layout={{ rows: 12 }}
              readOnly={locked}
              ariaLabel={t("instructions.specific")}
              content={body}
              onSave={async (next) => {
                if (!(await save(withJobBody(text, next))))
                  throw new InstructionsNotSavedError();
              }}
              placeholder={t("instructions.placeholder")}
            />
          </section>
        </div>
      )}
    </div>
  );
}
