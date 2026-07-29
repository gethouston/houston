/**
 * Sender identity for the chat panel (HOU-943): in a SHARED (multiplayer)
 * deployment every turn says who sent it — a teammate's face + name on human
 * messages, the agent's mark + name on its own. Single-player is untouched: the
 * transcript renders exactly as before.
 *
 * The faces resolve through the same batched `GET /v1/org/profiles` lookup the
 * mission face stacks use (one cache entry per contributor set), with the
 * caller's own resolved profile layered on for their rows. A profile that never
 * landed (or a host with no roster) falls back to the author's stored name, then
 * to initials — a row is never faceless.
 */

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

/** The chat sender face diameter (HOU-960): the group-chat 32px, sized so the
 *  face reads as a person beside the bubble, top-aligned with its first line.
 *  The agent mark matches it so human and agent rows share one optical line. */
const AGENT_MARK_PX = 32;
const SENDER_FACE_CLASS = "size-8";
const SENDER_INITIALS_CLASS = "text-xs";

/** Every distinct author id in a conversation's feed (stable, sorted). */
function authorIdsIn(feedItems: FeedItem[]): string[] {
  const ids = new Set<string>();
  for (const item of feedItems) {
    if (item.feed_type === "user_message" && item.author)
      ids.add(item.author.userId);
  }
  return Array.from(ids).sort();
}

export interface ChatSenderIdentity {
  /**
   * `true` = attribute EVERY turn once multiplayer plus the transcript proves a
   * teammate participated. NEVER `false`: `undefined` hands the decision to
   * `ui/chat`'s ≥2-distinct-authors heuristic. That remains the right fallback
   * while the viewer profile is resolving and for authored transcripts from a
   * host that does not advertise multiplayer, where hard `false` would actively
   * suppress attribution.
   */
  showSenders: true | undefined;
  /** The agent's display name, shown on its rows. */
  agentLabel: string | undefined;
  /** The face for a message's sender: teammate photo/initials, or agent mark. */
  renderSenderAvatar: (msg: ChatMessage) => ReactNode | undefined;
  /**
   * The text-colour utility a row's sender NAME wears (HOU-960): a teammate's
   * stable person tone, or the agent's own avatar colour. `ui/chat` owns the
   * layout, the app owns the palette — the same seam `renderSenderAvatar`
   * already draws.
   */
  senderNameClass: (msg: ChatMessage) => string | undefined;
}

export function useChatSenderAvatars(
  agent: Agent | null,
  feedItems: FeedItem[],
): ChatSenderIdentity {
  const { capabilities } = useCapabilities();
  const myProfile = useMyProfile();

  // Every authored id in the transcript — empty in single-player, where no
  // message carries an author, and the batched profiles query is multiplayer
  // gated on top of that (see `profilesQueryEnabled`).
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
      // The `id` is what gives the initials fallback this person's opaque
      // `person.*` tone — one person, one tone, on the board and here alike.
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

  // A person's colour is a property of the PERSON, so the name tone hashes the
  // same stable user id their avatar fill does (`personNameToneClass` and
  // `personToneClass` share one index) — one teammate, one colour, on the
  // board, on their face, and on their name. The agent wears its own avatar
  // colour, dropped to plain ink in whichever theme that colour cannot carry
  // 4.5:1 as text.
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
