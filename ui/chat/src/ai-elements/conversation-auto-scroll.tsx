import { useEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { useConversationScrollAnimation } from "./conversation-viewport-pin";

export type ConversationAutoScrollProps = {
  status: "ready" | "streaming" | "submitted";
  latestToken?: number;
};

export const ConversationAutoScroll = ({
  status,
  latestToken,
}: ConversationAutoScrollProps) => {
  const { scrollToBottom } = useStickToBottomContext();
  const animation = useConversationScrollAnimation();
  const prevStatusRef = useRef(status);
  const prevTokenRef = useRef(latestToken);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === "submitted" && prev !== "submitted")
      scrollToBottom({ animation });
  }, [status, scrollToBottom, animation]);

  useEffect(() => {
    if (prevTokenRef.current === latestToken) return;
    prevTokenRef.current = latestToken;
    scrollToBottom({ animation });
  }, [latestToken, scrollToBottom, animation]);

  return null;
};
