/**
 * @mentions of teammates in a chat (HOU-944) — the app half.
 *
 * `ui/chat` never fetches: it takes the roster, the row avatar and the labels
 * as props. This hook resolves all four from the active space's co-member
 * directory and hands them to `ChatPanel` (via `AIBoard`). Off multiplayer the
 * rosters are empty, so `@` just types plainly and no popover ever opens.
 */

import type { ChatPanelProps, MentionPerson } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOrgPeople } from "../hooks/queries/use-org-people";
import { PersonFace } from "./mission-person-face";

/** The four @mention props an `AIBoard` mount forwards to its `ChatPanel`. */
export interface ChatMentionProps {
  /** Teammates the composer can @mention (the viewer excluded). */
  mentionPeople: ChatPanelProps["mentionPeople"];
  /** Roster an agent reply's "@Name" runs are chipped against (viewer included). */
  messageMentionPeople: ChatPanelProps["messageMentionPeople"];
  /** Face for a row in the @mention popover. */
  renderMentionAvatar: ChatPanelProps["renderMentionAvatar"];
  /** Localized labels for the @mention popover. */
  mentionLabels: ChatPanelProps["mentionLabels"];
}

export function useChatMentions(): ChatMentionProps {
  const { t } = useTranslation("chat");
  const { people, mentionable } = useOrgPeople();

  // Same face the sender line and the board stacks render, so one person wears
  // one opaque `person.*` tone everywhere — the `id` is what supplies it.
  const renderMentionAvatar = useCallback(
    (person: MentionPerson) => (
      <PersonFace
        person={{
          id: person.userId,
          label: person.name,
          imageUrl: person.imageUrl,
        }}
      />
    ),
    [],
  );

  const mentionLabels = useMemo(
    () => ({ listAriaLabel: t("mentions.listAriaLabel") }),
    [t],
  );

  return {
    mentionPeople: mentionable,
    messageMentionPeople: people,
    renderMentionAvatar,
    mentionLabels,
  };
}
