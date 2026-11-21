import type { ChatPanelProps, MentionPerson } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOrgPeople } from "../hooks/queries/use-org-people";
import { PersonFace } from "./mission-person-face";

export interface ChatMentionProps {
  mentionPeople: ChatPanelProps["mentionPeople"];
  messageMentionPeople: ChatPanelProps["messageMentionPeople"];
  renderMentionAvatar: ChatPanelProps["renderMentionAvatar"];
  mentionLabels: ChatPanelProps["mentionLabels"];
}

export function useChatMentions(): ChatMentionProps {
  const { t } = useTranslation("chat");
  const { people, mentionable } = useOrgPeople();

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
