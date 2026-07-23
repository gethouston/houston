import { Button } from "@houston-ai/core";
import { Loader2, Mail } from "lucide-react";
import type { ReactNode } from "react";
import type { SignInHighlight } from "../../lib/last-sign-in";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "./provider-brand-icons";

const ICON_BY_HIGHLIGHT: Record<SignInHighlight, () => ReactNode> = {
  google: GoogleIcon,
  apple: AppleIcon,
  azure: MicrosoftIcon,
  email: () => <Mail className="size-4" />,
};

/**
 * The one-click "continue with the account you used last time" action. It IS
 * the returning-user path: a single filled, full-width button pinned above the
 * provider row, carrying the last provider's mark, the "Continue with X" title,
 * and the full account address as a caption. Clicking it runs exactly the
 * same sign-in the matching provider pill would (or, for the email path, kicks
 * off the passwordless code flow with the stored address prefilled).
 *
 * It owns the screen's single filled slot while shown, so the email form's send
 * button steps down to secondary underneath it.
 */
export function ContinueLastSignIn({
  highlight,
  title,
  email,
  pending,
  disabled,
  onClick,
}: {
  highlight: SignInHighlight;
  title: string;
  email: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = ICON_BY_HIGHLIGHT[highlight];
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      aria-label={email ? `${title} (${email})` : title}
      className="h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3"
    >
      <span className="flex size-5 items-center justify-center">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon />}
      </span>
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="text-sm font-medium">{title}</span>
        {email && (
          <span className="max-w-full truncate text-xs text-action-text/70">
            {email}
          </span>
        )}
      </span>
    </Button>
  );
}
