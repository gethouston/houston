import { Button } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { nativeShell } from "../../../../packages/web/src/shims/native-shell";
import { osIsNativeMobile } from "../../lib/os-bridge/platform";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "./provider-brand-icons";

export type Provider = "google" | "apple" | "azure";

export function providerAvailable(provider: Provider): boolean {
  return (
    !osIsNativeMobile() || nativeShell()?.identity.providers[provider] === true
  );
}

export function hasAvailableProviders(): boolean {
  return (["google", "apple", "azure"] as const).some(providerAvailable);
}

export function ProviderButtonRow({
  pending,
  onSignIn,
}: {
  pending: Provider | null;
  onSignIn: (provider: Provider) => () => void;
}) {
  const { t } = useTranslation("auth");
  if (!hasAvailableProviders()) return null;
  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
      {providerAvailable("google") && (
        <ProviderButton
          label={t("continueWith", { provider: "Google" })}
          pending={pending === "google"}
          disabled={pending !== null}
          onClick={onSignIn("google")}
        >
          <GoogleIcon />
        </ProviderButton>
      )}
      {providerAvailable("apple") && (
        <ProviderButton
          label={t("continueWith", { provider: "Apple" })}
          pending={pending === "apple"}
          disabled={pending !== null}
          onClick={onSignIn("apple")}
        >
          <AppleIcon />
        </ProviderButton>
      )}
      {providerAvailable("azure") && (
        <ProviderButton
          label={t("continueWith", { provider: "Microsoft" })}
          pending={pending === "azure"}
          disabled={pending !== null}
          onClick={onSignIn("azure")}
        >
          <MicrosoftIcon />
        </ProviderButton>
      )}
    </div>
  );
}

function ProviderButton({
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
      variant="secondary"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-11 justify-center rounded-full border-none! shadow-none active:scale-[0.96] md:h-10 md:flex-1 md:active:scale-100"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : children}
      <span className="md:hidden">{label}</span>
    </Button>
  );
}
