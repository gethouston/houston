import { useTranslation } from "react-i18next";
import { ContextEditorPage } from "../context/context-editor";
import { useContextSlot } from "../context/context-slots";
import { PageContainer } from "../shell/page-shell";

/**
 * About me: what every agent knows about the PERSON before it starts a turn.
 *
 * A TOP-LEVEL view for everyone, sitting under the Inbox. It used to be one of
 * two tabs on a Context screen hidden behind a door in the Inbox's masthead,
 * which asked the user to find a door and then pick a tab before reaching the
 * one thing they came for. Standing knowledge about you is not a preference and
 * it is not somebody's admin territory, so it is a row of its own and it owns
 * the whole window: no back bar, because there is no level above it.
 *
 * The other half of that screen, what the agents know about the COMPANY, is not
 * here on purpose. It is shared by everyone in the space, so it belongs to Admin
 * (its Company context section) and it exists only in a team space. On a
 * personal install this page is the whole of the product's standing context,
 * which is exactly right: a second "about this workspace" editor there would
 * duplicate this one.
 *
 * The stored files are unchanged: this reads and writes the SAME `user` slot of
 * the workspace context blob the Context screen wrote (`context-slots.ts` →
 * `use-workspace-context.ts`), so nothing a user already told their agents
 * moves or needs migrating.
 */
export function AboutMeView() {
  const { t } = useTranslation("context");
  const editor = useContextSlot("user");

  return (
    // No page scroll: the editor page pins its document card to a fixed
    // bottom gap, and a longer document scrolls inside the card.
    <div className="min-h-0 flex-1">
      <PageContainer className="flex h-full min-h-0 flex-col pt-10">
        <ContextEditorPage
          title={t("aboutMe.title")}
          subtitle={t("aboutMe.subtitle")}
          ready={editor.ready}
          content={editor.content}
          onSave={editor.onSave}
          placeholder={t("editor.user.placeholder")}
        />
      </PageContainer>
    </div>
  );
}
