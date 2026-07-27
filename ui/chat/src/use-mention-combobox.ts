/**
 * The composer's @mention SURFACE wiring (HOU-944): `useMentionAutocomplete`
 * plus the ids that tie the two halves together.
 *
 * Focus never leaves the textarea, so the accessibility relationship is a
 * combobox: the textarea is the input, the popover's list is the listbox it
 * `aria-controls`, and the highlighted row is what it names as its
 * `aria-activedescendant`. Both ends need the SAME ids, and both render from
 * `chat-input.tsx` — so the ids are minted once, here, instead of being
 * threaded through it.
 */

import { useCallback, useId } from "react";
import type { MentionComboboxAria } from "./chat-input-form.tsx";
import type { ChatInputMentionsProps } from "./chat-input-mentions.tsx";
import type {
  MentionAutocomplete,
  UseMentionAutocompleteOptions,
} from "./use-mention-autocomplete.ts";
import { useMentionAutocomplete } from "./use-mention-autocomplete.ts";

/** What `<ChatInputMentions>` needs that is not the consumer's own labels or
 *  avatar render prop. */
type MentionListProps = Omit<
  ChatInputMentionsProps,
  "children" | "listAriaLabel" | "renderAvatar"
>;

export interface MentionComposer {
  refresh: MentionAutocomplete["refresh"];
  onKeyDown: MentionAutocomplete["onKeyDown"];
  mentionsFor: MentionAutocomplete["mentionsFor"];
  commitSent: MentionAutocomplete["commitSent"];
  list: MentionListProps;
  /** Absent while the list is shut, which reverts the textarea to a plain one. */
  combobox?: MentionComboboxAria;
}

export function useMentionCombobox(
  options: UseMentionAutocompleteOptions,
): MentionComposer {
  const mentions = useMentionAutocomplete(options);
  const listId = `${useId()}mentions`;
  const optionId = useCallback(
    (index: number) => `${listId}-${index}`,
    [listId],
  );
  // The filter can narrow between two renders, leaving the highlight past the
  // end; `aria-activedescendant` must never name a row that is not there.
  const highlighted = Math.min(
    mentions.highlighted,
    Math.max(0, mentions.suggestions.length - 1),
  );

  return {
    refresh: mentions.refresh,
    onKeyDown: mentions.onKeyDown,
    mentionsFor: mentions.mentionsFor,
    commitSent: mentions.commitSent,
    list: {
      highlighted,
      listId,
      onDismiss: mentions.dismiss,
      onHighlight: mentions.setHighlighted,
      onSelect: mentions.accept,
      open: mentions.open,
      optionId,
      people: mentions.suggestions,
    },
    combobox: mentions.open
      ? {
          "aria-controls": listId,
          "aria-activedescendant": optionId(highlighted),
        }
      : undefined,
  };
}
