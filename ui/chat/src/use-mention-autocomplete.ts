/**
 * Composer state for @mentions (HOU-944): the active "@query" at the caret, the
 * highlighted row, the caret restoration after an accept, and the pending picks
 * a send will carry.
 *
 * The composer stays a plain `<textarea>`: accepting a person inserts PLAIN
 * TEXT "@Name " and records `{userId, name}` on the side, under the draft being
 * written. What ships is whatever `resolveMentions` still finds in the sent
 * text, so deleting the words also deletes the mention.
 */

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mentionKeyAction } from "./mention-keys.ts";
import type { MentionQuery } from "./mention-query.ts";
import {
  carryDismissal,
  filterMentionPeople,
  findMentionQuery,
  insertMention,
  isMentionListOpen,
} from "./mention-query.ts";
import type { MentionPerson, MessageMention } from "./types";
import { usePendingMentions } from "./use-pending-mentions.ts";

const NO_PEOPLE: readonly MentionPerson[] = [];

/** The bucket picks land in when the consumer names no draft (a standalone
 *  composer that never switches conversations). */
const DEFAULT_DRAFT_KEY = "";

export interface UseMentionAutocompleteOptions {
  /** Teammates that may be offered. Empty/absent disables the whole feature. */
  people?: readonly MentionPerson[];
  /** False while something else owns the keyboard (dictation capture). */
  enabled: boolean;
  /** Opaque identity of the draft being written (the app's session key). Picks
   *  are parked under it, so switching conversations neither loses them nor
   *  attaches them to the next conversation's send. */
  draftKey?: string;
  /** Writes the composer text after an accept. */
  onTextChange: (text: string) => void;
}

export interface MentionAutocomplete {
  open: boolean;
  suggestions: MentionPerson[];
  highlighted: number;
  setHighlighted: (index: number) => void;
  /** Recompute the active query from the textarea's live value + caret. */
  refresh: (textarea: HTMLTextAreaElement) => void;
  /** Interception for the composer's `onKeyDown`; calls `preventDefault()`
   *  on every key it consumes, which is what makes `PromptInputTextarea` bail
   *  before its own Enter/Escape handling. */
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  accept: (person: MentionPerson) => void;
  dismiss: () => void;
  mentionsFor: (sent: string) => MessageMention[];
  commitSent: () => void;
}

export function useMentionAutocomplete({
  people,
  enabled,
  draftKey = DEFAULT_DRAFT_KEY,
  onTextChange,
}: UseMentionAutocompleteOptions): MentionAutocomplete {
  const roster = people ?? NO_PEOPLE;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeRef = useRef<MentionQuery | null>(null);
  const caretRef = useRef<number | null>(null);
  const pending = usePendingMentions(draftKey);
  const [active, setActive] = useState<MentionQuery | null>(null);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  // An empty roster (single-player, a personal space, an older gateway) filters
  // to nobody, and no candidates means "@" is just a character. Dictation owns
  // the keyboard while capturing, so the list stays shut then too.
  const suggestions = active ? filterMentionPeople(roster, active.query) : [];
  const open = isMentionListOpen({
    enabled,
    suggestionCount: suggestions.length,
    active,
    dismissedStart,
  });

  const setActiveQuery = useCallback((next: MentionQuery | null) => {
    const prev = activeRef.current;
    if (
      prev &&
      next &&
      prev.start === next.start &&
      prev.query === next.query
    ) {
      return;
    }
    activeRef.current = next;
    setActive(next);
    setDismissedStart((current) => carryDismissal(current, next));
    setHighlighted(0);
  }, []);

  const refresh = useCallback(
    (textarea: HTMLTextAreaElement) => {
      textareaRef.current = textarea;
      if (roster.length === 0) {
        setActiveQuery(null);
        return;
      }
      setActiveQuery(
        findMentionQuery(textarea.value, textarea.selectionStart ?? 0),
      );
    },
    [roster.length, setActiveQuery],
  );

  const dismiss = useCallback(() => {
    const query = activeRef.current;
    if (query) setDismissedStart(query.start);
  }, []);

  const accept = useCallback(
    (person: MentionPerson) => {
      const textarea = textareaRef.current;
      const query = activeRef.current;
      if (!textarea || !query) return;
      const next = insertMention(
        textarea.value,
        query.start,
        textarea.selectionStart ?? textarea.value.length,
        person,
      );
      pending.record({ userId: person.userId, name: person.name });
      caretRef.current = next.caret;
      setActiveQuery(null);
      // This token is settled. Otherwise a name accepted before a comma (which
      // takes no trailing space) re-offers itself as soon as the caret lands
      // after it, and the next Enter re-accepts instead of sending.
      setDismissedStart(query.start);
      onTextChange(next.text);
    },
    [onTextChange, pending.record, setActiveQuery],
  );

  // Put the caret back after the accepted name once React has committed the new
  // value, so typing continues where the user expects. Deliberately runs after
  // EVERY commit (no dependency list): the trigger is a ref an event handler
  // set, which no dependency can express, and the guard no-ops every other pass.
  useEffect(() => {
    const caret = caretRef.current;
    const textarea = textareaRef.current;
    if (caret === null || !textarea) return;
    caretRef.current = null;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  });

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open) return;
      const count = suggestions.length;
      const action = mentionKeyAction(
        {
          key: event.key,
          shiftKey: event.shiftKey,
          isComposing: event.nativeEvent.isComposing,
        },
        count,
      );
      if (!action) return;
      event.preventDefault();
      if (action.kind === "move") {
        setHighlighted((index) => (index + action.step) % count);
        return;
      }
      if (action.kind === "dismiss") {
        dismiss();
        return;
      }
      const person = suggestions[Math.min(highlighted, count - 1)];
      if (person) accept(person);
    },
    [open, suggestions, highlighted, accept, dismiss],
  );

  return {
    open,
    suggestions,
    highlighted,
    setHighlighted,
    refresh,
    onKeyDown,
    accept,
    dismiss,
    mentionsFor: pending.mentionsFor,
    commitSent: pending.commitSent,
  };
}
