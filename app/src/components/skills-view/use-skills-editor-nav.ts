import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "../../stores/ui";
import {
  resolvePendingSkillActivity,
  type SkillEditorView,
} from "./skill-editor-model";
import type { ManagedSkillRow } from "./skill-editor-props";

export function useSkillsEditorNav(args: {
  rows: ManagedSkillRow[];
  rowsLoaded: boolean;
  openChat: (row: ManagedSkillRow) => void;
  closeChat: () => void;
  autoOpenChat: boolean;
}): {
  editing: ManagedSkillRow | null;
  view: SkillEditorView | null;
  setView: (view: SkillEditorView) => void;
  open: (row: ManagedSkillRow) => void;
  close: () => void;
  openText: (slug: string) => void;
} {
  const { rows, rowsLoaded, openChat, closeChat, autoOpenChat } = args;
  const [slug, setSlug] = useState<string | null>(null);
  const [view, setView] = useState<SkillEditorView | null>(null);
  const resolved = useRef<ManagedSkillRow | null>(null);
  const found =
    slug === null ? null : (rows.find((r) => r.slug === slug) ?? null);
  if (slug === null) resolved.current = null;
  else if (found !== null) resolved.current = found;
  const editing = slug === null ? null : resolved.current;

  const open = useCallback((row: ManagedSkillRow) => {
    setSlug(row.slug);
    setView(null);
  }, []);

  const close = useCallback(() => {
    setSlug(null);
    setView(null);
    closeChat();
  }, [closeChat]);

  const openText = useCallback(
    (target: string) => {
      if (!rows.some((r) => r.slug === target)) return;
      setSlug(target);
      setView("text");
    },
    [rows],
  );

  const autoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (editing === null) {
      autoOpened.current = null;
      return;
    }
    if (!autoOpenChat || autoOpened.current === editing.slug) return;
    autoOpened.current = editing.slug;
    openChat(editing);
  }, [editing, autoOpenChat, openChat]);

  const pendingActivityId = useUIStore((s) => s.pendingSkillChatActivityId);
  const setPendingSkillChatActivityId = useUIStore(
    (s) => s.setPendingSkillChatActivityId,
  );
  useEffect(() => {
    if (slug !== null) return;
    const pending = resolvePendingSkillActivity({
      rows,
      rowsLoaded,
      activityId: pendingActivityId,
    });
    if (pending.kind === "wait") return;
    setPendingSkillChatActivityId(null);
    if (pending.kind === "drop") return;
    setSlug(pending.row.slug);
    setView(null);
  }, [
    pendingActivityId,
    rows,
    rowsLoaded,
    slug,
    setPendingSkillChatActivityId,
  ]);

  return { editing, view, setView, open, close, openText };
}
