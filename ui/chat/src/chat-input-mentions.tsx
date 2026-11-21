import { Popover, PopoverAnchor, PopoverContent } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useRef } from "react";
import type { MentionPerson } from "./types";

export interface ChatInputMentionsProps {
  open: boolean;
  people: readonly MentionPerson[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onSelect: (person: MentionPerson) => void;
  onDismiss: () => void;
  renderAvatar?: (person: MentionPerson) => ReactNode;
  listAriaLabel?: string;
  listId: string;
  optionId: (index: number) => string;
  children: ReactNode;
}

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
        className="w-72 max-w-[min(20rem,90vw)] p-1 data-[state=closed]:animate-none data-[state=open]:animate-none"
        data-mention-popover=""
        onCloseAutoFocus={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
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
