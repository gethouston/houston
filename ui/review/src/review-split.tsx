import { type ReactNode, useMemo, useState } from "react";
import { ReviewDetailPanel } from "./review-detail-panel";
import { ReviewSidebar } from "./review-sidebar";
import type { ReviewItemData } from "./types";

export interface ReviewSplitProps {
  items: ReviewItemData[];
  initialSelectedId?: string | null;
  /** Render prop: the host app provides its own chat panel for the detail view */
  renderChat: (props: {
    sessionKey: string;
    placeholder: string;
    item: ReviewItemData;
  }) => ReactNode;
  /** Shown when no item is selected */
  emptyMessage?: string;
}

export function ReviewSplit({
  items,
  initialSelectedId = null,
  renderChat,
  emptyMessage = "Select a conversation to review",
}: ReviewSplitProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left panel -- fixed width sidebar */}
      <div className="w-[270px] shrink-0">
        <ReviewSidebar
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Right panel -- detail or empty */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {selectedItem ? (
          <ReviewDetailPanel item={selectedItem} renderChat={renderChat} />
        ) : (
          <div className="flex h-full items-center justify-center bg-background">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
