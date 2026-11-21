import { Button, Kbd } from "@houston-ai/core";

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
