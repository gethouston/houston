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

/** The prose box's signal that a save did not land (see `onSave` below). */
class InstructionsNotSavedError extends Error {
  override name = "InstructionsNotSavedError";
}

/**
 * The agent's Job description (CLAUDE.md), drawn as a FORM in the Settings
 * screen's grammar: the industry and the role as two settings rows of one
 * card, then "Specific instructions" over the standing-prose editor
 * ({@link ContextEditorBox}) holding the free description. The rows name what
 * they hold, so the page needs no line under its title explaining them.
 *
 * The file is structured like a skill: a short block of facts (industry, role)
 * over the free description. Both halves are read from the SAME query, so an
 * agent that rewrites its own file shows up here without a refresh, and both
 * halves recompose over the text as it stands right now — a row pick never
 * overwrites prose, and a prose save never overwrites the facts.
 *
 * `level={2}`: the drilled header's identity lozenge already carries the
 * screen's `<h1>`.
 */
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
  // The rows sit in the section's locked fieldset; the editor is no control.
  const { locked } = useOrgWriteLock();
  const text = instructions ?? "";
  const { fields, body } = parseJobDescription(text);
  // A row pick paints at once; a refusal puts the old answer back and says so.
  const write = (content: string) => void save(content);

  return (
    <div className="pb-2">
      <PageHero level={2} title={t("subTabs.instructions")} className="mb-6" />
      {instructions === undefined && isError ? (
        // The read failed (already reported): say so and offer the read
        // again, rather than a spinner that never resolves.
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
        // A loading frame while the one read lands, so neither the facts nor
        // the description ever flashes as empty. Not an empty state.
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
            {/* The group title visually names the box but is not
                programmatically tied to it, so it is passed as the box's own
                accessible name too. */}
            <ContextEditorBox
              layout={{ rows: 12 }}
              readOnly={locked}
              ariaLabel={t("instructions.specific")}
              content={body}
              onSave={async (next) => {
                // The box keeps the typed text and stays dirty only if its
                // save REJECTS; the refusal is already toasted and reported.
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
