import { Button, Dialog, DialogContent, DialogTitle } from "@houston-ai/core";

interface MissionIntroModalProps {
  /** Visible while the user hasn't kicked off the mission yet. */
  open: boolean;
  /**
   * One-line muted header at the top, e.g.
   * `"Mission: Work with your first agent"`. Wired to Radix `DialogTitle`
   * so the dialog stays accessible.
   */
  header: string;
  /** Body sentence — the visual focal point in foreground color. */
  body: string;
  /** Label on the only button. Clicking fires `onCta`. */
  ctaLabel: string;
  onCta: () => void;
}

/**
 * Centered intro modal at the start of the Try, Skill, and Routine
 * missions. Three lines stacked: muted header, foreground body, CTA. No
 * big title, no eyebrow — just one labelled line above the body so the
 * user immediately reads what this is about, then the explanation, then
 * the action.
 *
 * Why a modal instead of an inline tip card: the earlier split-screen
 * put instructions to the LEFT of the chat. Users read the chat and
 * missed the left rail entirely. The modal forces the explanation in
 * front of the chat for one beat, then gets out of the way.
 *
 * Dismissal is deliberately CTA-only: the dialog ignores Escape and
 * outside-click. The always-on Skip link in the chat-frame header is
 * the only other exit.
 */
export function MissionIntroModal({
  open,
  header,
  body,
  ctaLabel,
  onCta,
}: MissionIntroModalProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center gap-4 px-2 py-2 text-center">
          <DialogTitle className="text-sm font-normal text-muted-foreground">
            {header}
          </DialogTitle>
          <p className="text-base leading-relaxed text-foreground">{body}</p>
          <Button className="mt-1 rounded-full px-5" onClick={onCta}>
            {ctaLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
