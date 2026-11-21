import { useTranslation } from "react-i18next";
import { ContextEditorBox } from "../context/context-editor";
import { ContextSlotWaiting } from "../context/context-slot-waiting";
import { useContextSlot } from "../context/context-slots";
import { AccountPage } from "./account-page";

export function AboutMeView() {
  const { t } = useTranslation("context");
  const editor = useContextSlot("user");

  return (
    <AccountPage title={t("aboutMe.title")} subtitle={t("aboutMe.subtitle")}>
      {editor.state === "ready" ? (
        <ContextEditorBox
          layout={{ rows: 14 }}
          ariaLabel={t("aboutMe.title")}
          content={editor.content}
          onSave={editor.onSave}
          placeholder={t("editor.user.placeholder")}
        />
      ) : (
        <ContextSlotWaiting state={editor.state} />
      )}
    </AccountPage>
  );
}
