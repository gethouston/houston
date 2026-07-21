import { Button } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "./provider-brand-icons";

export type Provider = "google" | "apple" | "azure";

/**
 * The OAuth options as a single row of icon-only pills under the email field.
 * Brand icons are self-identifying; the full "Continue with X" label survives
 * as `aria-label` + `title`, so screen readers and tooltips keep the words.
 * Equal `flex-1` widths keep the row balanced.
 *
 * `lastUsed` softly rings the provider the user signed in with last time (a
 * subtle focus-toned halo, not a colour explosion); its aria-label also gains
 * the localized "Last used" note so the hint is not sight-only.
 */
export function ProviderButtonRow({
  pending,
  onSignIn,
  lastUsed = null,
  lastUsedLabel,
}: {
  pending: Provider | null;
  onSignIn: (provider: Provider) => () => void;
  lastUsed?: Provider | null;
  lastUsedLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <ProviderIconButton
        label="Continue with Google"
        pending={pending === "google"}
        disabled={pending !== null}
        lastUsed={lastUsed === "google"}
        lastUsedLabel={lastUsedLabel}
        onClick={onSignIn("google")}
      >
        <GoogleIcon />
      </ProviderIconButton>
      <ProviderIconButton
        label="Continue with Apple"
        pending={pending === "apple"}
        disabled={pending !== null}
        lastUsed={lastUsed === "apple"}
        lastUsedLabel={lastUsedLabel}
        onClick={onSignIn("apple")}
      >
        <AppleIcon />
      </ProviderIconButton>
      <ProviderIconButton
        label="Continue with Microsoft"
        pending={pending === "azure"}
        disabled={pending !== null}
        lastUsed={lastUsed === "azure"}
        lastUsedLabel={lastUsedLabel}
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
  lastUsed,
  lastUsedLabel,
  onClick,
  children,
}: {
  label: string;
  pending: boolean;
  disabled: boolean;
  lastUsed: boolean;
  lastUsedLabel?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  // Outline (not ring) so the halo never fights the pill's `shadow-none`; the
  // offset lifts it clear of the pill edge into a clean focus-toned halo — it
  // reads cleanly against the neutral grey pill because it sits outside its edge.
  const highlight = lastUsed
    ? " outline outline-2 outline-offset-2 outline-[var(--ht-focus)]"
    : "";
  return (
    <Button
      variant="secondary"
      aria-label={
        lastUsed && lastUsedLabel ? `${label} (${lastUsedLabel})` : label
      }
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`h-10 flex-1 justify-center rounded-full border-none! shadow-none${highlight}`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : children}
    </Button>
  );
}
