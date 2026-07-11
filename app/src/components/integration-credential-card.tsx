import { useTranslation } from "react-i18next";
import {
  useCustomIntegrations,
  useSubmitCustomCredential,
} from "../hooks/queries";
import { useUIStore } from "../stores/ui";
import { CustomCredentialForm } from "./integrations/custom-credential-form";
import { customAuthMethod } from "./integrations/custom-integrations-model";

interface IntegrationCredentialCardProps {
  /** The custom integration's slug the agent asked the user to credential. */
  toolkit: string;
  /** Why the agent needs the key, routed into the card's bold title. When
   *  absent, the title falls back to "Add your {name} key". */
  reason?: string;
  /** Fired once the secret is stored — the caller advances the stepper and
   *  resumes the agent with the saved integration's display name. */
  onSaved: (name: string) => void;
}

/**
 * The secure key-entry card for a `request_credential` interaction step: the
 * user pastes a custom integration's API key into a password field and the
 * secret goes straight to the host's secret store (`submitCustomIntegrationCredential`),
 * NEVER into the chat transcript. It subscribes to the custom-integrations list
 * so the integration's real name + declared fields fill in reactively; until
 * they resolve the form shows a single "API key" field so the flow never blocks.
 *
 * It follows the same Mercury lockup as {@link ChatConnectInteractionCard}: a
 * compact bold title (the agent's reason, or "Add your {name} key") over one
 * muted reassurance line, then the secure form — rendered INSIDE the shared
 * interaction card's surface, so it adds no nested box of its own.
 *
 * On success the mutation's `call()` wrapper stays silent (success), a success
 * toast fires here, and `onSaved` advances the stepper. On failure that same
 * wrapper already toasts + reports, and `isPending` clears so the Save button
 * re-enables — no silent failure, no infinite spinner.
 */
export function IntegrationCredentialCard({
  toolkit,
  reason,
  onSaved,
}: IntegrationCredentialCardProps) {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);
  const list = useCustomIntegrations();
  const submit = useSubmitCustomCredential();

  const view = list.data?.find((v) => v.slug === toolkit);
  const name = view?.name ?? toolkit;
  const authMethod = view ? customAuthMethod(view) : null;
  const title = reason ?? t("credential.title", { name });

  const onSubmit = (values: Record<string, string>) => {
    submit.mutate(
      { slug: toolkit, values },
      {
        onSuccess: (saved) => {
          // `verified === false` means the key SAVED but the service's probe
          // rejected it (the header guess may not fit this service): warn
          // instead of celebrating, and still resume the agent — it can test
          // the integration and re-request the key if calls really fail.
          if (saved.verified === false) {
            addToast({
              title: t("credential.savedUnverifiedToast", { name }),
              variant: "info",
            });
          } else {
            addToast({
              title: t("credential.savedToast", { name }),
              variant: "success",
            });
          }
          onSaved(name);
        },
      },
    );
  };

  return (
    <div className="mt-4 flex flex-col">
      <span className="text-balance font-semibold text-base text-foreground leading-snug">
        {title}
      </span>
      <p className="mt-1.5 text-muted-foreground text-sm">
        {t("credential.subtitle")}
      </p>
      <div className="mt-3">
        <CustomCredentialForm
          authMethod={authMethod}
          submitting={submit.isPending}
          onSubmit={onSubmit}
          submitLabel={t("credential.save")}
          submittingLabel={t("credential.saving")}
          autoFocus
        />
      </div>
    </div>
  );
}
