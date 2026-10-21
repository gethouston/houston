import { AsyncButton, Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { SkillEditorState } from "./use-skill-editor";

/** Discard and Save under the skill's body; a locked org saves nothing. */
export function SkillEditorSaveRow({
  editor,
  locked,
}: {
  editor: SkillEditorState;
  locked: boolean;
}) {
  const { t } = useTranslation("skills");
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        className="rounded-full"
        disabled={!editor.dirty}
        onClick={editor.discard}
      >
        {t("editor.discard")}
      </Button>
      <AsyncButton
        type="button"
        className="rounded-full"
        disabled={!editor.savable || locked}
        onClick={editor.save}
      >
        {t("detail.saveChanges")}
      </AsyncButton>
    </div>
  );
}
