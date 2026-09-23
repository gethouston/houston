import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "../../stores/ui";
import {
  resolvePendingSkillActivity,
  type SkillEditorView,
} from "./skill-editor-model";
import type { ManagedSkillRow } from "./skill-editor-props";

/**
 * The Skills library's one navigation state: the list, or ONE skill's editor
 * in its place. The open row is held by SLUG and re-resolved from the live
 * rows every render, so a skill the agent renames or re-assigns under the
 * editor stays in step.
 *
 * Entering the editor also opens that skill's chat on the right, which is
 * where the editing actually happens; closing the chat leaves the editor up,
 * and the host's "Open chat" pill mounts it again. On a phone the panel COVERS
 * the content, so the chat waits for that pill rather than burying the editor
 * the tap just opened.
 */
export function useSkillsEditorNav(args: {
  rows: ManagedSkillRow[];
  /** False while the skills aggregate is still being read. */
  rowsLoaded: boolean;
  /** Mount the skill's chat in the shell panel. */
  openChat: (row: ManagedSkillRow) => void;
  closeChat: () => void;
  /** False on phones, where the panel would cover the editor. */
  autoOpenChat: boolean;
}): {
  editing: ManagedSkillRow | null;
  view: SkillEditorView | null;
  setView: (view: SkillEditorView) => void;
  open: (row: ManagedSkillRow) => void;
  close: () => void;
  /** The chat's "Edit manually": the skill's markdown, in the left pane. */
  openText: (slug: string) => void;
} {
  const { rows, rowsLoaded, openChat, closeChat, autoOpenChat } = args;
  const [slug, setSlug] = useState<string | null>(null);
  const [view, setView] = useState<SkillEditorView | null>(null);
  // The row is re-resolved from the live aggregate every render, so holders
  // and titles the agent changes under the editor stay in step. A slug the
  // aggregate cannot answer for RIGHT NOW keeps its last resolved row rather
  // than bouncing the user out: the aggregate goes briefly empty on a roster
  // reload, and the authority on "this skill is gone" is the detail query's
  // own 404 (`useMissingSkillDismiss`), which leaves with a toast that says so.
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

  // The chat's "Edit manually" targets the skill the conversation just wrote;
  // its row may still be settling into the aggregate, so a miss is a quiet
  // no-op (the row click covers it once the list refreshes).
  const openText = useCallback(
    (target: string) => {
      if (!rows.some((r) => r.slug === target)) return;
      setSlug(target);
      setView("text");
    },
    [rows],
  );

  // One auto-open per editor entry: reopening the chat the user deliberately
  // closed would make the X useless.
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

  // A finished skill chat notifies with its activity id; the skill that chat
  // built is the one to open. Whoever RESOLVES the id spends it: the chat is
  // not guaranteed to mount (a phone waits for the "Open chat" pill), and an
  // id left standing reopens this editor on every Back and then rides on to
  // hijack the next chat the user opens.
  const pendingActivityId = useUIStore((s) => s.pendingSkillChatActivityId);
  const setPendingSkillChatActivityId = useUIStore(
    (s) => s.setPendingSkillChatActivityId,
  );
  useEffect(() => {
    // An editor already on screen is not displaced: the notification waits
    // until the user leaves it, rather than throwing away an open draft.
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
