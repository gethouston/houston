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
  const [signInStarted, setSignInStarted] = useState(false);

  const view = list.data?.find((v) => v.slug === toolkit);
  const name = view?.name ?? toolkit;
  const missing = list.data != null && !list.isFetching && !view;
  const oauth = view?.auth === "oauth";
  const mode: CredentialStepMode = oauth ? "oauth" : "key";
  const active = view?.state.status === "active";

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
    isSaved: revisited && active,
    busy: submit.isPending || signIn.isPending,
    submitting: submit.isPending,
    signInPending: signIn.isPending,
    awaitingGrant: signInStarted && !active,
    retry: signInStarted && !signIn.isPending,
    blockedUrl,
    signInFailed: signIn.isError && !signIn.isPending,
    save,
    startSignIn: () =>
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
