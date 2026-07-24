import { Button, Kbd } from "@houston-ai/core";

/**
 * The decline pill every interaction step's footer carries — the quiet ghost
 * "Skip" on a connect / sign-in / credential step, the more prominent outline
 * "Not now" on an approval — with its Esc keycap hint. One Button + Kbd lockup,
 * shared so the four cards render the identical affordance (and so each card file
 * stays under the size limit). The label + esc copy arrive translated; the
 * `variant` keeps each card's exact tone; the card owns the decision on click.
 */
export function ChatStepDeclineButton({
  label,
  escLabel,
  disabled,
  onClick,
  variant = "ghost",
}: {
  label: string;
  escLabel: string;
  disabled?: boolean;
  onClick: () => void;
  variant?: "ghost" | "outline";
}) {
  return (
    <Button
      className={variant === "ghost" ? "gap-1.5 text-ink-muted" : "gap-1.5"}
      disabled={disabled}
      onClick={onClick}
      size="sm"
      type="button"
      variant={variant}
    >
      {label}
      <Kbd>{escLabel}</Kbd>
    </Button>
  );
}
