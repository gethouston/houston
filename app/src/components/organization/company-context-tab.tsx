import { useTranslation } from "react-i18next";
import { ContextEditorPage } from "../context/context-editor";
import { useContextSlot } from "../context/context-slots";
import type { OrgTabProps } from "./organization-view";

/**
 * Company context: the standing knowledge every agent in this workspace starts
 * a turn with. It is admin-owned org-wide copy, so it sits beside Org chart,
 * People and Billing in Admin; the per-user half of the same
 * context lives with the user.
 *
 * This is the section the dashboard's identity lozenge stands for, so the
 * lozenge never names it — the page does: `ContextEditorPage` (the ONE
 * standing-prose editor) with a level-2 hero saying "Company context" and what
 * belongs in it, over the always-open box whose greyed 3-part example is the
 * invitation.
 *
 * `useContextSlot("workspace")` is the read and the write.
 *
 * Takes {@link OrgTabProps} for uniformity with every other section even though
 * it reads nothing off the shared context.
 */
export default function CompanyContextTab(_props: OrgTabProps) {
  const { t } = useTranslation("teams");
  const { t: tContext } = useTranslation("context");
  const editor = useContextSlot("workspace");

  return (
    <ContextEditorPage
      level={2}
      title={t("org.tabs.companyContext")}
      subtitle={t("org.companyContextHint")}
      ready={editor.ready}
      content={editor.content}
      onSave={editor.onSave}
      placeholder={tContext("editor.workspace.placeholder")}
    />
  );
}
