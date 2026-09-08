import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { ContextEditorBox } from "../../context/context-editor";
import { useContextSlot } from "../../context/context-slots";

/**
 * About me: what every agent knows about the PERSON before it starts a turn.
 *
 * A Settings section, because it is a standing preference the user sets once
 * about themselves — the same drawer their name, their photo and their
 * language live in. It drills in from the Settings index and wears that
 * screen's chrome (the back bar and the reading column), so it draws the
 * editor as a COMPACT card ({@link ContextEditorBox}'s `rows` mode) rather
 * than the pinned full-window page a top-level surface gets: the column
 * scrolls, and a card that claimed the viewport height inside it would have
 * none to claim.
 *
 * The stored file is the workspace context blob's `user` slot
 * (`context-slots.ts` → `use-workspace-context.ts`), which the open agent's
 * runtime reads into its prompt. `ready` gates the box behind a spinner while
 * that read lands: a loading frame, not an empty state.
 */
export function AboutMeSection() {
  const { t } = useTranslation(["settings", "context"]);
  const editor = useContextSlot("user");

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">
        {t("context:aboutMe.title")}
      </h2>
      <p className="text-sm text-ink-muted mb-6">
        {t("context:aboutMe.subtitle")}
      </p>
      {editor.ready ? (
        <ContextEditorBox
          layout={{ rows: 14 }}
          ariaLabel={t("context:aboutMe.title")}
          content={editor.content}
          onSave={editor.onSave}
          placeholder={t("context:editor.user.placeholder")}
        />
      ) : (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-5 w-5" />
        </div>
      )}
    </section>
  );
}
