import { useTranslation } from "react-i18next";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";
import { ContextEditorBox } from "../context/context-editor";
import { ContextSlotWaiting } from "../context/context-slot-waiting";
import { useContextSlot } from "../context/context-slots";

/**
 * The Company context sheet's body: the ONE standing-prose editor on the
 * workspace slot. `useContextSlot("workspace")` is the read and the write,
 * and the greyed 3-part example in the always-open box is the invitation.
 */
export function CompanyContextEditor() {
  const { t } = useTranslation("teams");
  const { t: tContext } = useTranslation("context");
  const editor = useContextSlot("workspace");
  const { locked } = useOrgWriteLock();

  if (editor.state !== "ready")
    return <ContextSlotWaiting state={editor.state} />;

  return (
    <ContextEditorBox
      layout="fill"
      readOnly={locked}
      ariaLabel={t("org.companyContext.title")}
      content={editor.content}
      onSave={editor.onSave}
      placeholder={tContext("editor.workspace.placeholder")}
    />
  );
}
