import { personNameToneClass } from "@houston-ai/board";
import type { ChatMessage, FeedItem } from "@houston-ai/chat";
import {
  agentNameToneClass,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { type ReactNode, useCallback, useMemo } from "react";
import { useUserProfiles } from "../hooks/queries/use-user-profiles";
import { useCapabilities } from "../hooks/use-capabilities";
import { useMyProfile } from "../hooks/use-my-profile";
import { chatSenderMode } from "../lib/chat-sender-mode";
import { shortUserLabel } from "../lib/mission-people";
import { isMultiplayer } from "../lib/org-roles";
import type { Agent } from "../lib/types";
import { PersonFace } from "./mission-person-face";

const AGENT_MARK_PX = 32;
const SENDER_FACE_CLASS = "size-8";
const SENDER_INITIALS_CLASS = "text-xs";

function authorIdsIn(feedItems: FeedItem[]): string[] {
  const ids = new Set<string>();
  for (const item of feedItems) {
    if (item.feed_type === "user_message" && item.author)
      ids.add(item.author.userId);
  }
  return Array.from(ids).sort();
}

export interface ChatSenderIdentity {
  showSenders: true | undefined;
  agentLabel: string | undefined;
  renderSenderAvatar: (msg: ChatMessage) => ReactNode | undefined;
  senderNameClass: (msg: ChatMessage) => string | undefined;
}

export function useChatSenderAvatars(
  agent: Agent | null,
  feedItems: FeedItem[],
): ChatSenderIdentity {
  const { capabilities } = useCapabilities();
  const myProfile = useMyProfile();

  const authorIds = useMemo(() => authorIdsIn(feedItems), [feedItems]);
  const showSenders = chatSenderMode(
    authorIds,
    myProfile?.userId,
    isMultiplayer(capabilities),
  );
  const { profiles } = useUserProfiles(authorIds);

  const agentColor = agent?.color;
  const renderSenderAvatar = useCallback(
    (msg: ChatMessage): ReactNode | undefined => {
      if (msg.from === "assistant")
        return (
          <HoustonAvatar
            color={resolveAgentColor(agentColor)}
            diameter={AGENT_MARK_PX}
          />
        );
      const author = msg.author;
      if (!author) return undefined;
      const isSelf = myProfile?.userId === author.userId;
      const profile = profiles.get(author.userId);
      const name =
        (isSelf ? myProfile?.name : null) ??
        profile?.name ??
        author.name ??
        shortUserLabel(author.userId);
      const imageUrl =
        (isSelf ? myProfile?.avatarUrl : null) ?? profile?.avatarUrl ?? null;
      return (
        <PersonFace
          className={SENDER_FACE_CLASS}
          initialsClassName={SENDER_INITIALS_CLASS}
          person={{
            id: author.userId,
            label: name,
            imageUrl: imageUrl ?? undefined,
          }}
        />
      );
    },
    [agentColor, profiles, myProfile],
  );

  const senderNameClass = useCallback(
    (msg: ChatMessage): string | undefined => {
      if (msg.from === "assistant") return agentNameToneClass(agentColor);
      return msg.author ? personNameToneClass(msg.author.userId) : undefined;
    },
    [agentColor],
  );

  return {
    showSenders,
    agentLabel: agent?.name,
    renderSenderAvatar,
    senderNameClass,
  };
}
