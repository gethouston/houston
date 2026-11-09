import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  Sheet,
  SheetContent,
  SheetTitle,
  useIsMobile,
} from "@houston-ai/core";
import { useRef, useState } from "react";
import { CommentForm, type CommentFormProps } from "./comment-form";

export interface CommentEditorProps
  extends Omit<CommentFormProps, "onSubmit" | "onCancel" | "roomy"> {
  open: boolean;
  /** Where the selection is on screen right now. */
  anchorRect: () => DOMRect;
  /** The selection's crop, shown on the phone sheet. */
  cropBase64?: string;
  /** Gets focus back when the editor closes. */
  returnFocus: () => void;
  onSubmit: (comment: string) => void;
  onCancel: () => void;
}

/**
 * The comment prompt for a selection: a popover anchored to it on desktop,
 * scaling from the selection's edge, and a bottom sheet on the phone. Focus
 * stays inside while it is open and goes back to where it came from. Keyboard
 * closes (Esc, ⌘↵) skip the exit animation.
 */
export function CommentEditor({
  open,
  anchorRect,
  cropBase64,
  returnFocus,
  onSubmit,
  onCancel,
  ...form
}: CommentEditorProps) {
  const mobile = useIsMobile();
  const [instant, setInstant] = useState(false);
  const virtual = useRef({ getBoundingClientRect: anchorRect });
  virtual.current.getBoundingClientRect = anchorRect;
  const finish = (keyboard: boolean, done: () => void) => {
    setInstant(keyboard);
    done();
  };
  const body = (roomy: boolean) => (
    <CommentForm
      {...form}
      roomy={roomy}
      onSubmit={(comment, keyboard) =>
        finish(keyboard, () => onSubmit(comment))
      }
      onCancel={(keyboard) => finish(keyboard, onCancel)}
    />
  );
  if (mobile)
    return (
      <Sheet open={open} onOpenChange={(next) => !next && onCancel()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          data-instant={instant ? "true" : undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus();
          }}
          className="pdf-sheet gap-3 rounded-t-3xl border-0 px-4 pt-2 pb-safe"
        >
          <span
            aria-hidden
            className="mx-auto h-1.5 w-9 rounded-full bg-line-input"
          />
          <SheetTitle className="sr-only">{form.labels.placeholder}</SheetTitle>
          {cropBase64 && (
            <img
              alt=""
              src={`data:image/png;base64,${cropBase64}`}
              className="h-24 w-full rounded-xl object-contain ht-hairline"
            />
          )}
          <div className="pb-3">{body(true)}</div>
        </SheetContent>
      </Sheet>
    );
  return (
    // Modal: focus stays in the form until it is answered or dismissed.
    <Popover modal open={open} onOpenChange={(next) => !next && onCancel()}>
      <PopoverAnchor virtualRef={virtual} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        data-instant={instant ? "true" : undefined}
        onEscapeKeyDown={() => setInstant(true)}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
        onInteractOutside={(e) => e.preventDefault()}
        className="pdf-pop w-75 rounded-2xl border-0 p-3 ht-shadow-dialog"
      >
        {body(false)}
      </PopoverContent>
    </Popover>
  );
}
