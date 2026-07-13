import { Button } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { isAppleSignInEnabled } from "../../lib/identity";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "./provider-brand-icons";

export type Provider = "google" | "apple" | "azure";

/**
 * The OAuth options as a single row of icon-only pills under the email field.
 * Brand icons are self-identifying; the full "Continue with X" label survives
 * as `aria-label` + `title`, so screen readers and tooltips keep the words.
 * Equal `flex-1` widths keep the row balanced whether Apple renders or not.
 */
export function ProviderButtonRow({
  pending,
  onSignIn,
}: {
  pending: Provider | null;
  onSignIn: (provider: Provider) => () => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <ProviderIconButton
        label="Continue with Google"
        pending={pending === "google"}
        disabled={pending !== null}
        onClick={onSignIn("google")}
      >
        <GoogleIcon />
      </ProviderIconButton>
      {/* Gated: renders only once the GCIP apple.com provider is configured
          (APPLE_SIGN_IN_ENABLED) — an unconfigured build must never show a
          sign-in method that can only error. */}
      {isAppleSignInEnabled() && (
        <ProviderIconButton
          label="Continue with Apple"
          pending={pending === "apple"}
          disabled={pending !== null}
          onClick={onSignIn("apple")}
        >
          <AppleIcon />
        </ProviderIconButton>
      )}
      <ProviderIconButton
        label="Continue with Microsoft"
        pending={pending === "azure"}
        disabled={pending !== null}
        onClick={onSignIn("azure")}
      >
        <MicrosoftIcon />
      </ProviderIconButton>
    </div>
  );
}

function ProviderIconButton({
  label,
  pending,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="default"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-10 flex-1 justify-center rounded-full border-none! shadow-none"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : children}
    </Button>
  );
}
