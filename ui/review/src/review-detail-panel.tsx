import type { ReactNode } from "react";
import type { ReviewItemData } from "./types";

export interface ReviewDetailPanelProps {
  item: ReviewItemData;
  /** Render prop: the host app provides its own chat panel implementation */
  renderChat: (props: {
    sessionKey: string;
    placeholder: string;
    item: ReviewItemData;
  }) => ReactNode;
}

export function ReviewDetailPanel({
  item,
  renderChat,
}: ReviewDetailPanelProps) {
  const sessionKey = item.sessionId ?? item.id;
  const placeholder =
    item.status === "needs_you"
      ? "Give feedback or approve..."
      : "Type a message...";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {renderChat({ sessionKey, placeholder, item })}
    </div>
  );
}
