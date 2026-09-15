import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  claimSignInTab,
  useAgentCustomIntegrations,
  useStartCustomOAuth,
  useSubmitCustomCredential,
} from "../hooks/queries";
import { tauriSystem } from "../lib/tauri";
import { useUIStore } from "../stores/ui";
import type { CredentialStepMode } from "./chat-credential-step-fields";
import { customAuthMethod } from "./integrations/custom-integrations-model";

/**
 * The credential step's data + mutations, kept out of the card the way every
 * sibling step keeps its flow (`useChatConnect`, `useChatProviderConnect`).
 *
 * Both the list read and the save ride the PER-AGENT surface (HOU-823) — the one
 * route a gateway-fronted deployment proxies to the agent's pod; the top-level
 * form 404s at the gateway, which failed every managed-cloud save.
 */
export function useChatCredentialStep({
  agentId,
  toolkit,
  revisited,
  onSaved,
}: {
  agentId: string;
  toolkit: string;
  revisited: boolean;
  onSaved: (name: string, mode: CredentialStepMode) => void;
}) {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);
  const list = useAgentCustomIntegrations(agentId);
  const submit = useSubmitCustomCredential(agentId);
  const signIn = useStartCustomOAuth(agentId);
  // The browser sign-in was opened from THIS card (set once the browser TOOK
  // the URL — a failed start or a refused open keeps the plain Sign in button
  // and shows no false waiting line); the flip to "active" (delivered by
  // CustomIntegrationsChanged) is then this step's completion.
  const [signInStarted, setSignInStarted] = useState(false);

  const view = list.data?.find((v) => v.slug === toolkit);
  const name = view?.name ?? toolkit;
  // The step's slug resolves to NO registered integration (PRODUCT-1292): a key
  // typed here has nowhere to go — every save 404ed while the card looked
  // perfectly savable. The card renders the honest dead-end (Skip resumes the
  // agent, which re-runs the setup) instead of a doomed form. Gated on a SETTLED
  // list: while it is loading or refetching (a just-added definition races the
  // 30s cache) the optimistic fallback form stays, matching the form's "never
  // block the user on the lookup" contract. `data === null` (the host doesn't
  // serve the feature) keeps the legacy fallback too.
  const missing = list.data != null && !list.isFetching && !view;
  // A sign-in (oauth) integration renders the SAME step as a Sign in card: no
  // key form — the button opens the service's own browser sign-in (PRODUCT-1172)
  // and the step completes itself when the grant lands.
  const oauth = view?.auth === "oauth";
  const mode: CredentialStepMode = oauth ? "oauth" : "key";
  const active = view?.state.status === "active";

  // Sign-in completion arrives OUT OF BAND (the host's callback emits the change
  // event, the list refetches, the def reads active) — advance exactly once.
  const completedRef = useRef(false);
  useEffect(() => {
    if (!oauth || !signInStarted || !active || completedRef.current) return;
    completedRef.current = true;
    addToast({
      title: t("credential.signedInToast", { name }),
      variant: "success",
    });
    onSaved(name, "oauth");
  }, [oauth, signInStarted, active, name, addToast, onSaved, t]);

  const save = (values: Record<string, string>) => {
    submit.mutate(
      { slug: toolkit, values },
      {
        onSuccess: (saved) => {
          // `verified === false` means the key SAVED but the service's probe
          // rejected it: warn instead of celebrating, and still resume the agent
          // — it can test the integration and re-request if calls fail.
          addToast(
            saved.verified === false
              ? {
                  title: t("credential.savedUnverifiedToast", { name }),
                  variant: "info",
                }
              : {
                  title: t("credential.savedToast", { name }),
                  variant: "success",
                },
          );
          onSaved(name, "key");
        },
      },
    );
  };

  // The web build's popup blocker refused the open after the async mint: the
  // minted URL is kept for an explicit click, which the browser honors.
  const blockedUrl =
    signIn.data && !signIn.data.opened && !signInStarted
      ? signIn.data.authorizeUrl
      : null;

  return {
    name,
    mode,
    oauth,
    missing,
    iconUrl: view?.iconUrl ?? null,
    authMethod: view ? customAuthMethod(view) : null,
    // The integration flips to "active" once its key is stored; on a revisit
    // that marks the step done, so it shows the calm saved state.
    isSaved: revisited && active,
    busy: submit.isPending || signIn.isPending,
    submitting: submit.isPending,
    signInPending: signIn.isPending,
    /** The sign-in ran from here and the grant hasn't landed yet. */
    awaitingGrant: signInStarted && !active,
    /** A sign-in already ran from here, so the button offers another go. */
    retry: signInStarted && !signIn.isPending,
    /** The browser refused the open; this URL is the manual way through. */
    blockedUrl,
    /** The start itself failed (mint refused, pod never woke) — say so. */
    signInFailed: signIn.isError && !signIn.isPending,
    save,
    startSignIn: () =>
      // The tab is claimed HERE, inside the click: the authorize URL is minted
      // over an async hop and a browser refuses a `window.open` after it
      // (PRODUCT-1625).
      signIn.mutate(
        { slug: toolkit, tab: claimSignInTab() },
        { onSuccess: ({ opened }) => setSignInStarted(opened) },
      ),
    openBlocked: () => {
      if (!blockedUrl) return;
      void tauriSystem.openUrl(blockedUrl).then((opened) => {
        if (opened) setSignInStarted(true);
      });
    },
  };
}
