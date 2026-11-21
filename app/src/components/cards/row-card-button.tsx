import { AsyncButton } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface RowCardButtonProps {
  label: ReactNode;
  onClick: () => unknown;
  icon?: ReactNode;
  iconPosition?: "leading" | "trailing";
  loading?: boolean;
  disabled?: boolean;
  variant?: "default" | "outline";
}

export function RowCardButton({
  label,
  onClick,
  icon,
  iconPosition = "leading",
  loading = false,
  disabled = false,
  variant = "default",
}: RowCardButtonProps) {
  return (
    <AsyncButton
      type="button"
      variant={variant === "outline" ? "outline" : "default"}
      size="sm"
      spinner={false}
      disabled={disabled || loading}
      onClick={() => {
        const result: unknown = onClick();
        return result instanceof Promise ? result : undefined;
      }}
      className="h-7 gap-1 rounded-full px-2.5 text-xs font-medium"
    >
      {loading ? (
        <Loader2 className="size-3 animate-spin" />
      ) : iconPosition === "leading" ? (
        icon
      ) : null}
      {label}
      {!loading && iconPosition === "trailing" ? icon : null}
    </AsyncButton>
  );
}
