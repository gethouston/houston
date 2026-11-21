import type {
  BillingChoice,
  BillingChoicePick,
  BillingChoiceSave,
} from "@houston/engine-adapter";
import { canChangeChoice, saveSettlesNotice } from "@houston/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { reportError } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import { hasSpaces } from "../../lib/org-roles";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";
import { useChoiceNow } from "../use-choice-now";

function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(id);
  }, []);
  return ready;
}

export function useBillingChoice() {
  const { capabilities } = useCapabilities();
  const idle = useAfterFirstPaint();
  return useQuery({
    queryKey: queryKeys.billingChoice(),
    queryFn: tauriOrg.getBillingChoice,
    enabled: idle && hasSpaces(capabilities),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useFreeOrgChoiceOpen(): boolean {
  const { data: choice } = useBillingChoice();
  const now = useChoiceNow(choice);
  return choice ? canChangeChoice(choice, now) : false;
}

type Cached = BillingChoice | null | undefined;

export function useSetBillingChoice() {
  const client = useQueryClient();
  const dismiss = useDismissBillingChoice();
  const { t } = useTranslation("plan");
  return useMutation({
    mutationFn: (pick: BillingChoicePick) => tauriOrg.setBillingChoice(pick),
    onSuccess: async (outcome: BillingChoiceSave) => {
      if (outcome.kind === "saved") {
        client.setQueryData(queryKeys.billingChoice(), outcome.choice);
        if (saveSettlesNotice(outcome)) dismiss.mutate();
        Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.orgs() }),
          client.invalidateQueries({ queryKey: queryKeys.billingAll() }),
        ]).catch((error: unknown) =>
          reportError(
            "billing_choice_refresh",
            "Could not reread org billing after a pick",
            error,
          ),
        );
        return;
      }
      showExpectedStateToast(
        t(`choice.refused.${outcome.kind}.title`),
        t(`choice.refused.${outcome.kind}.body`),
      );
      await client.invalidateQueries({ queryKey: queryKeys.billingChoice() });
    },
  });
}

export function useDismissBillingChoice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: tauriOrg.dismissBillingChoiceNotice,
    onMutate: async () => {
      await client.cancelQueries({ queryKey: queryKeys.billingChoice() });
      client.setQueryData(queryKeys.billingChoice(), (choice: Cached) =>
        choice ? { ...choice, noticeDismissed: true } : choice,
      );
    },
    onError: () =>
      client.setQueryData(queryKeys.billingChoice(), (choice: Cached) =>
        choice ? { ...choice, noticeDismissed: false } : choice,
      ),
  });
}
