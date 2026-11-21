import type { RawConversation } from "../../lib/conversations-facade";
import { isSetupChatMode } from "../../lib/integration-chat-setup";
import { ARCHIVED_STATUS } from "../../lib/mission-selection";

export function archivedMissionRows(
  conversations: readonly RawConversation[],
): RawConversation[] {
  return conversations.filter(
    (conversation) =>
      conversation.type === "activity" &&
      conversation.status === ARCHIVED_STATUS &&
      !isSetupChatMode(conversation.agent),
  );
}
