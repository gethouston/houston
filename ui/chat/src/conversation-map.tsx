import { useCallback, useEffect, useMemo, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import {
  type ConversationMapLabels,
  DEFAULT_CONVERSATION_MAP_LABELS,
  type ResolvedConversationMapLabels,
} from "./conversation-map-labels";
import type { ConversationMoment } from "./conversation-map-model";
import { ConversationMapPanel } from "./conversation-map-panel";

export type { ConversationMapLabels } from "./conversation-map-labels";

export interface ConversationMapProps {
  moments: ConversationMoment[];
  conversationLength: number;
  labels?: ConversationMapLabels;
  onOpenChange?: (open: boolean, conversationLength: number) => void;
  onMomentClick?: (
    moment: ConversationMoment,
    conversationLength: number,
  ) => void;
  onBackToLatest?: (conversationLength: number) => void;
  onMomentHighlight?: (messageKey: string) => void;
}

/** A props-only, current-DOM conversation index. It intentionally keeps no history. */
export function ConversationMap({
  moments,
  conversationLength,
  labels,
  onOpenChange,
  onMomentClick,
  onBackToLatest,
  onMomentHighlight,
}: ConversationMapProps) {
  const { scrollRef, scrollToBottom } = useStickToBottomContext();
  const [open, setOpen] = useState(false);
  const [activeMessageKey, setActiveMessageKey] = useState<string | null>(null);
  const resolvedLabels = useMemo<ResolvedConversationMapLabels>(
    () => ({
      ...DEFAULT_CONVERSATION_MAP_LABELS,
      ...labels,
      types: { ...DEFAULT_CONVERSATION_MAP_LABELS.types, ...labels?.types },
    }),
    [labels],
  );

  const changeOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next, conversationLength);
    },
    [conversationLength, onOpenChange],
  );

  useEffect(() => {
    if (moments.length >= 3 || !open) return;
    changeOpen(false);
  }, [changeOpen, moments.length, open]);

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
      const target = root.querySelector<HTMLElement>(
        `[data-conversation-message-key="${moment.messageKey}"]`,
      );
      if (target) observer.observe(target);
    }
    return () => observer.disconnect();
  }, [moments, scrollRef]);

  const selectMoment = useCallback(
    (moment: ConversationMoment) => {
      const target = scrollRef.current?.querySelector<HTMLElement>(
        `[data-conversation-message-key="${moment.messageKey}"]`,
      );
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setActiveMessageKey(moment.messageKey);
      onMomentHighlight?.(moment.messageKey);
      onMomentClick?.(moment, conversationLength);
    },
    [conversationLength, onMomentClick, onMomentHighlight, scrollRef],
  );

  const backToLatest = useCallback(() => {
    scrollToBottom();
    setActiveMessageKey(moments.at(-1)?.messageKey ?? null);
    onBackToLatest?.(conversationLength);
  }, [conversationLength, moments, onBackToLatest, scrollToBottom]);

  return (
    <ConversationMapPanel
      activeMessageKey={activeMessageKey}
      labels={resolvedLabels}
      moments={moments}
      onBackToLatest={backToLatest}
      onOpenChange={changeOpen}
      onSelectMoment={selectMoment}
      open={open}
    />
  );
}
