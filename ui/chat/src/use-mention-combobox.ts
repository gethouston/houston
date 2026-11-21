import { useCallback, useId } from "react";
import type { MentionComboboxAria } from "./chat-input-form.tsx";
import type { ChatInputMentionsProps } from "./chat-input-mentions.tsx";
import type {
  MentionAutocomplete,
  UseMentionAutocompleteOptions,
} from "./use-mention-autocomplete.ts";
import { useMentionAutocomplete } from "./use-mention-autocomplete.ts";

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
