import { useCallback, useEffect, useMemo, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import {
  type ConversationMapLabels,
  type ResolvedConversationMapLabels,
  resolveConversationMapLabels,
} from "./conversation-map-labels";
import type { ConversationMoment } from "./conversation-map-model";
import { searchConversationMoments } from "./conversation-map-model";
import { ConversationMapPanel } from "./conversation-map-panel";

export type { ConversationMapLabels } from "./conversation-map-labels";

export interface ConversationMapProps {
  moments: ConversationMoment[];
  conversationLength: number;
  labels?: ConversationMapLabels;
  actions?: ConversationMapActions;
  onOpenChange?: (open: boolean, conversationLength: number) => void;
  onMomentClick?: (
    moment: ConversationMoment,
    conversationLength: number,
  ) => void;
  onBackToLatest?: (conversationLength: number) => void;
  onMomentHighlight?: (messageKey: string) => void;
}

export interface ConversationMapActions {
  onMoveToDone?: () => void;
  onDelete?: () => void;
  deleteTitle?: string;
  deleteDescription?: string;
}

/** A props-only, current-DOM conversation index. It intentionally keeps no history. */
export function ConversationMap({
  moments,
  conversationLength,
  labels,
  actions,
  onOpenChange,
  onMomentClick,
  onBackToLatest,
  onMomentHighlight,
}: ConversationMapProps) {
  const { scrollRef, scrollToBottom, stopScroll } = useStickToBottomContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMessageKey, setActiveMessageKey] = useState<string | null>(null);
  const resolvedLabels = useMemo<ResolvedConversationMapLabels>(
    () => resolveConversationMapLabels(labels),
    [labels],
  );

  const changeOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) setQuery("");
      onOpenChange?.(next, conversationLength);
    },
    [conversationLength, onOpenChange],
  );

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || moments.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = entry.target.getAttribute(
            "data-conversation-message-key",
          );
          if (!key) continue;
          if (entry.isIntersecting)
            visible.set(key, entry.boundingClientRect.top);
          else visible.delete(key);
        }
        const nearest = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (nearest) setActiveMessageKey(nearest[0]);
      },
      { root, threshold: 0.45 },
    );
    for (const moment of moments) {
      const target = findMessageElement(root, moment.messageKey);
      if (target) observer.observe(target);
    }
    return () => observer.disconnect();
  }, [moments, scrollRef]);

  const selectMoment = useCallback(
    (moment: ConversationMoment) => {
      const root = scrollRef.current;
      const target = root
        ? findMessageElement(root, moment.messageKey)
        : undefined;
      if (!target) return;
      stopScroll();
      target.scrollIntoView({ behavior: "auto", block: "center" });
      target.focus({ preventScroll: true });
      setActiveMessageKey(moment.messageKey);
      onMomentHighlight?.(moment.messageKey);
      onMomentClick?.(moment, conversationLength);
      changeOpen(false);
    },
    [
      changeOpen,
      conversationLength,
      onMomentClick,
      onMomentHighlight,
      scrollRef,
      stopScroll,
    ],
  );

  const backToLatest = useCallback(() => {
    scrollToBottom();
    setActiveMessageKey(moments.at(-1)?.messageKey ?? null);
    onBackToLatest?.(conversationLength);
  }, [conversationLength, moments, onBackToLatest, scrollToBottom]);

  const searchResult = useMemo(
    () => searchConversationMoments(moments, query),
    [moments, query],
  );

  return (
    <ConversationMapPanel
      activeMessageKey={activeMessageKey}
      actions={actions}
      availableMomentCount={moments.length}
      hasQuery={searchResult.hasQuery}
      labels={resolvedLabels}
      moments={searchResult.moments}
      onBackToLatest={backToLatest}
      onOpenChange={changeOpen}
      onQueryChange={setQuery}
      onSelectMoment={selectMoment}
      open={open}
      query={query}
      rangesById={searchResult.rangesById}
    />
  );
}

function findMessageElement(
  root: HTMLElement,
  messageKey: string,
): HTMLElement | undefined {
  return [
    ...root.querySelectorAll<HTMLElement>("[data-conversation-message-key]"),
  ].find((element) => element.dataset.conversationMessageKey === messageKey);
}
