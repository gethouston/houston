import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { ExternalLink, KeyRound, LogIn } from "lucide-react";
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
import { ChoiceCard } from "./choice-card";
import {
  type CuratedIntegration,
  curatedAddInput,
} from "./curated-integrations";
import { curatedLogoUrl } from "./curated-logos";
import { CustomCredentialForm } from "./custom-credential-form";

/**
 * The connect dialog for a curated catalog entry (e.g. Croma): pick browser
 * sign-in (the lead option — nothing to copy) or an API key, with the
 * where-to-register / where-keys-live guidance non-technical users need.
 * Either pick first materializes the custom definition (`curatedAddInput`,
 * idempotent) and then drives the STOCK flow: `oauth/start` + browser, or the
 * secure credential save. Failures toast via the `call()` wrappers and keep
 * the dialog open for a retry; the half-made definition it may leave behind
 * lands in the Installed strip wearing its own Sign in / Enter key affordance,
 * so nothing dead-ends.
 */
export function CuratedConnectDialog({
  curated,
  agentId,
  onClose,
}: {
  /** The entry to connect, or null when the dialog is closed. */
  curated: CuratedIntegration | null;
  /** The transport agent (HOU-823): every call rides its routes, the one
   *  custom surface a gateway-fronted deployment proxies to the pod. */
  agentId?: string;
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
  onClose,
}: {
  curated: CuratedIntegration;
  agentId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("integrations");
  const addToast = useUIStore((s) => s.addToast);
  // Both options ALWAYS show, sign-in leading: the fork is the product
  // promise. A deployment that cannot run the browser sign-in rejects at the
  // host (`oauth_unsupported`) and the wrapper toasts the honest reason —
  // better than silently hiding the recommended path behind a capability
  // read that may still be resolving.
  const [step, setStep] = useState<"choose" | "key">("choose");

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
    add.mutate(curatedAddInput(curated, "credential"), {
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
        <div className="flex flex-col gap-2">
          <ChoiceCard
            icon={<LogIn className="size-5" />}
            title={t("curated.connect.signInTitle", { name })}
            description={t("curated.connect.signInDesc", { name })}
            emphasis="lead"
            badge={t("curated.connect.recommendedBadge")}
            disabled={busy}
            onClick={startSignIn}
          />
          <ChoiceCard
            icon={<KeyRound className="size-5" />}
            title={t("curated.connect.keyTitle")}
            description={t("curated.connect.keyDesc", { name })}
            disabled={busy}
            onClick={() => setStep("key")}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-muted">{t(curated.keyHelpKey)}</p>
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
