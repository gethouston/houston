import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@houston-ai/core";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAddCustomIntegration,
  useStartCustomOAuth,
  useSubmitCustomCredential,
} from "../../hooks/queries";
import { tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { AppLogo } from "./app-logo";
import { CuratedConnectOptions } from "./curated-connect-options";
import {
  type CuratedIntegration,
  curatedAddInput,
} from "./curated-integrations";
import { curatedLogoUrl } from "./curated-logos";
import { CustomCredentialForm } from "./custom-credential-form";

/**
 * The connect dialog for a curated catalog entry (Croma, HighLevel): the
 * provider's own connect when the deployment's catalog has this app (the lead
 * option — Composio's app covers the whole API), the service's MCP sign-in,
 * and, where the service offers one, an API key with the where-to-register /
 * where-keys-live guidance non-technical users need. The MCP picks first
 * materialize the custom definition (`curatedAddInput`, idempotent) and then
 * drive the STOCK flow: `oauth/start` + browser, or the secure credential
 * save. Failures toast via the `call()` wrappers and keep the dialog open for
 * a retry; the half-made definition it may leave behind lands in the
 * Installed strip wearing its own Sign in / Enter key affordance, so nothing
 * dead-ends.
 */
export function CuratedConnectDialog({
  curated,
  agentId,
  providerConnect,
  onClose,
}: {
  /** The entry to connect, or null when the dialog is closed. */
  curated: CuratedIntegration | null;
  /** The transport agent (HOU-823): every call rides its routes, the one
   *  custom surface a gateway-fronted deployment proxies to the pod. */
  agentId?: string;
  /** Start the provider (Composio) connect for this slug — present only when
   *  that catalog carries the app, so the option never dead-ends. */
  providerConnect?: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={curated !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {curated && (
        // Remount per entry so step/field state never leaks across opens.
        <DialogContent key={curated.slug} className="sm:max-w-md">
          <CuratedConnectBody
            curated={curated}
            agentId={agentId}
            providerConnect={providerConnect}
            onClose={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function CuratedConnectBody({
  curated,
  agentId,
  providerConnect,
  onClose,
}: {
  curated: CuratedIntegration;
  agentId?: string;
  providerConnect?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("integrations");
  const addToast = useUIStore((s) => s.addToast);
  // The options themselves (and which one leads) live in
  // `CuratedConnectOptions`; this body owns the two MCP flows behind them.
  const [step, setStep] = useState<"choose" | "key">("choose");
  // The non-secret companion value some servers need as a header on every
  // call (HighLevel's sub-account id). Required whenever the entry asks.
  const [headerValue, setHeaderValue] = useState("");
  const [headerMissing, setHeaderMissing] = useState(false);

  const add = useAddCustomIntegration(agentId);
  const signIn = useStartCustomOAuth(agentId);
  const submit = useSubmitCustomCredential(agentId);
  const busy = add.isPending || signIn.isPending || submit.isPending;
  const name = curated.name;

  const startSignIn = () => {
    add.mutate(curatedAddInput(curated, "oauth"), {
      onSuccess: () =>
        signIn.mutate(curated.slug, {
          onSuccess: () => {
            addToast({
              title: t("custom.oauth.openedToast", { name }),
              variant: "info",
            });
            onClose();
          },
        }),
    });
  };

  const saveKey = (values: Record<string, string>) => {
    const extra = curated.extraHeader;
    if (extra && !headerValue.trim()) {
      setHeaderMissing(true);
      return;
    }
    const headers = extra ? { [extra.name]: headerValue.trim() } : undefined;
    add.mutate(curatedAddInput(curated, "credential", headers), {
      onSuccess: () =>
        submit.mutate(
          { slug: curated.slug, values },
          {
            onSuccess: (saved) => {
              addToast(
                saved.verified === false
                  ? {
                      title: t("custom.keyDialog.savedUnverifiedToast", {
                        name,
                      }),
                      variant: "info",
                    }
                  : {
                      title: t("custom.keyDialog.savedToast", { name }),
                      variant: "success",
                    },
              );
              onClose();
            },
          },
        ),
    });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <AppLogo
            display={{
              toolkit: curated.slug,
              name,
              description: "",
              logoUrl: curatedLogoUrl(curated.slug),
            }}
            size="lg"
            className="rounded-lg"
          />
          <DialogTitle>{t("curated.connect.title", { name })}</DialogTitle>
        </div>
        <DialogDescription>{t(curated.descriptionKey)}</DialogDescription>
      </DialogHeader>

      {step === "choose" ? (
        <CuratedConnectOptions
          curated={curated}
          busy={busy}
          providerConnect={
            providerConnect
              ? () => {
                  onClose();
                  providerConnect();
                }
              : undefined
          }
          onSignIn={startSignIn}
          onKey={() => setStep("key")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-muted">
            {curated.keyHelpKey ? t(curated.keyHelpKey) : ""}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start gap-1.5"
            onClick={() => void tauriSystem.openUrl(curated.apiKeysUrl)}
          >
            <ExternalLink className="size-3.5" />
            {t("curated.connect.openKeys", { name })}
          </Button>
          {curated.extraHeader && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="curated-extra-header"
                className="text-sm font-medium text-ink"
              >
                {t(curated.extraHeader.labelKey)}
              </label>
              <Input
                id="curated-extra-header"
                value={headerValue}
                aria-invalid={headerMissing || undefined}
                onChange={(event) => {
                  setHeaderValue(event.target.value);
                  setHeaderMissing(false);
                }}
              />
              <p className="text-xs text-ink-muted">
                {headerMissing
                  ? t("curated.connect.headerRequired")
                  : t(curated.extraHeader.helpKey)}
              </p>
            </div>
          )}
          <CustomCredentialForm
            authMethod={null}
            submitting={busy}
            onSubmit={saveKey}
            submitLabel={t("custom.keyDialog.save")}
            submittingLabel={t("custom.keyDialog.saving")}
            autoFocus
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            disabled={busy}
            onClick={() => setStep("choose")}
          >
            {t("curated.connect.back")}
          </Button>
        </div>
      )}

      <p className="text-xs text-ink-muted">
        {t("curated.connect.newTo", { name })}{" "}
        <button
          type="button"
          className="text-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => void tauriSystem.openUrl(curated.signUpUrl)}
        >
          {t("curated.connect.createAccount", { name })}
        </button>
      </p>
    </>
  );
}
