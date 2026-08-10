import { useTranslation } from "react-i18next";
import { ContextEditorPage } from "../context/context-editor";
import { useContextSlot } from "../context/context-slots";
import type { OrgTabProps } from "./organization-view";

/**
 * Organization > Company context: the standing knowledge every agent in this
 * workspace starts a turn with. It is admin-owned org-wide copy, so it belongs
 * on the Admin dashboard next to People and Billing rather than on a screen of
 * its own; the per-user half of the same context lives with the user, not here.
 *
 * This is the section the Admin identity lozenge stands for, so the lozenge
 * never names it — the page does: `ContextEditorPage` (the ONE standing-prose
 * editor) with a level-2 hero saying "Company context" and what belongs in
 * it, over the always-open box whose greyed 3-part example is the invitation.
 *
 * The wire is unchanged — `useContextSlot("workspace")` reads and writes the
 * same blob it always did.
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
