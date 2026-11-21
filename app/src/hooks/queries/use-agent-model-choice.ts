import type {
  AgentModelChoice,
  AgentModelChoiceInfo,
} from "@houston/engine-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showExpectedStateToast } from "../../lib/error-toast";
import i18n from "../../lib/i18n";
import { isModelNotAllowedError } from "../../lib/model-not-allowed";
import {
  toCanonicalProviderId,
  toDisplayProviderId,
} from "../../lib/provider-overrides";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgentModelChoice } from "../../lib/tauri";

function toDisplayChoice(
  info: AgentModelChoiceInfo | null,
): AgentModelChoiceInfo | null {
  if (!info?.choice) return info;
  return {
    ...info,
    choice: {
      ...info.choice,
      provider: toDisplayProviderId(info.choice.provider),
    },
  };
}

export function useAgentModelChoice(agentId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.agentModelChoice(agentId),
    queryFn: async () =>
      toDisplayChoice(await tauriAgentModelChoice.get(agentId)),
    enabled,
    staleTime: 30_000,
  });
}

export function useSetAgentModelChoice(agentId: string) {
  const qc = useQueryClient();
  const key = queryKeys.agentModelChoice(agentId);
  return useMutation({
    mutationFn: (choice: AgentModelChoice) =>
      tauriAgentModelChoice.set(agentId, {
        ...choice,
        provider: toCanonicalProviderId(choice.provider),
      }),
    onMutate: async (choice) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentModelChoiceInfo | null>(key);
      if (prev) {
        qc.setQueryData<AgentModelChoiceInfo>(key, { ...prev, choice });
      }
      return { prev };
    },
    onError: (err, _choice, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
      if (isModelNotAllowedError(err)) {
        showExpectedStateToast(
          i18n.t("chat:errors.modelNotAllowed"),
          i18n.t("chat:errors.modelNotAllowedBody"),
        );
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
