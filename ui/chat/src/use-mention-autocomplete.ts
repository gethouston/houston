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

const DEFAULT_DRAFT_KEY = "";

export interface UseMentionAutocompleteOptions {
  people?: readonly MentionPerson[];
  enabled: boolean;
  draftKey?: string;
  onTextChange: (text: string) => void;
}

export interface MentionAutocomplete {
  open: boolean;
  suggestions: MentionPerson[];
  highlighted: number;
  setHighlighted: (index: number) => void;
  refresh: (textarea: HTMLTextAreaElement) => void;
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
      setDismissedStart(query.start);
      onTextChange(next.text);
    },
    [onTextChange, pending.record, setActiveQuery],
  );

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
