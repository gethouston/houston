/**
 * The @mention autocomplete surface (HOU-944): a solid, unanimated list of
 * teammates anchored above the composer while the caret sits in an "@query".
 *
 * Focus never leaves the textarea — the user keeps typing while the list
 * filters — so the popover suppresses Radix's open/close autofocus, and the
 * TEXTAREA carries the combobox semantics (`role`, `aria-expanded`,
 * `aria-controls`, `aria-activedescendant`) that point a screen reader at the
 * rows here. That is why the list is plain markup rather than cmdk: cmdk mints
 * its own element ids and writes them AFTER the caller's, so the textarea
 * could never name the option a reader is on. Rows carry `data-mention-option`
 * and the container `data-mention-popover` as stable test hooks.
 */

import { Popover, PopoverAnchor, PopoverContent } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useRef } from "react";
import type { MentionPerson } from "./types";

export interface ChatInputMentionsProps {
  open: boolean;
  people: readonly MentionPerson[];
  /** Index into `people` of the highlighted row. */
  highlighted: number;
  onHighlight: (index: number) => void;
  onSelect: (person: MentionPerson) => void;
  /** Called when the surface asks to close (Escape, outside click). */
  onDismiss: () => void;
  renderAvatar?: (person: MentionPerson) => ReactNode;
  listAriaLabel?: string;
  /** DOM id of the listbox, so the textarea can `aria-controls` it. */
  listId: string;
  /** DOM id for the row at `index`; the textarea points `aria-activedescendant`
   *  at the highlighted one. */
  optionId: (index: number) => string;
  /** The composer the list anchors to. */
  children: ReactNode;
}

/** Same surface as a shadcn `CommandItem`, minus cmdk's id ownership. */
const ROW_CLASS =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-[selected=true]:bg-hover data-[selected=true]:text-hover-text [&_svg]:pointer-events-none [&_svg]:shrink-0";

export function ChatInputMentions({
  open,
  people,
  highlighted,
  onHighlight,
  onSelect,
  onDismiss,
  renderAvatar,
  listAriaLabel = "Mention a teammate",
  listId,
  optionId,
  children,
}: ChatInputMentionsProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);

  return (
    <Popover
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      open={open}
    >
      <PopoverAnchor asChild>
        <div ref={anchorRef}>{children}</div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        // A keyboard-driven list opens instantly (DESIGN.md), and focus must
        // stay in the textarea so typing keeps filtering it.
        className="w-72 max-w-[min(20rem,90vw)] p-1 data-[state=closed]:animate-none data-[state=open]:animate-none"
        data-mention-popover=""
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Focus legitimately lives OUTSIDE this layer (in the textarea the
        // user keeps typing into), so a focus-outside must never dismiss it.
        onFocusOutside={(event) => event.preventDefault()}
        // Neither may a pointer-down on the ANCHOR: clicking into the very
        // "@query" the list is offering for is not "the user went elsewhere",
        // and treating it as a dismissal killed the list for the rest of the
        // token. Everywhere else outside still closes it.
        onInteractOutside={(event) => {
          const target = event.detail.originalEvent.target;
          if (target instanceof Node && anchorRef.current?.contains(target)) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="top"
        sideOffset={8}
      >
        <div
          aria-label={listAriaLabel}
          className="max-h-64 scroll-py-1 overflow-x-hidden overflow-y-auto"
          id={listId}
          role="listbox"
        >
          {people.map((person, index) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard path is the combobox's, not the row's — Arrow/Enter/Tab/Escape are handled on the textarea that owns focus (`mention-keys.ts`), which is exactly what the pattern prescribes.
            // biome-ignore lint/a11y/useFocusableInteractive: same reason — under aria-activedescendant the option is referenced by id from the focused textarea and must never take focus itself.
            <div
              aria-selected={index === highlighted}
              className={ROW_CLASS}
              data-mention-option={person.userId}
              data-selected={index === highlighted ? "true" : undefined}
              id={optionId(index)}
              key={person.userId}
              onClick={() => onSelect(person)}
              onPointerMove={() => onHighlight(index)}
              role="option"
            >
              {renderAvatar?.(person)}
              <span className="min-w-0 truncate">{person.name}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
