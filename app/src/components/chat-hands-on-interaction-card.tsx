import type { HandsOnSurface } from "@houston/protocol";
import { isHandsOnSurface } from "@houston/protocol";
import type { StepChrome } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { Check, CornerDownLeft, Hand } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useSurfaceGates } from "../hooks/use-surface-gates";
import { handsOnSurfaceReachable } from "../lib/hands-on-gates";
import { openHandsOnSurface } from "../lib/hands-on-navigation";
import {
  handsOnAgentSettings,
  handsOnManagerOnly,
  handsOnScreenLabel,
  inlineHandsOn,
  resolveHandsOnAgent,
} from "../lib/hands-on-screens";
import { useAgentStore } from "../stores/agents";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";
import { ChatHandsOnAgentApiCard } from "./chat-hands-on-agent-api-card";
import { ChatHandsOnApiKeyCard } from "./chat-hands-on-api-key-card";

interface Props extends StepChrome, StepDraftApi {
  stepId: string;
  surface: string;
  targetAgentId?: string;
  keyNameAgentId?: string;
  managerChat: boolean;
  reason?: string;
  onFinished: (name: string) => void;
  onSkip: (name: string, message?: string) => void;
}

export function ChatHandsOnInteractionCard({
  stepId,
  surface,
  targetAgentId,
  keyNameAgentId,
  managerChat,
  reason,
  onFinished,
  onSkip,
  ...chrome
}: Props) {
  const { t } = useTranslation("chat");
  const gates = useSurfaceGates();
  const { capabilities } = useCapabilities();
  const agents = useAgentStore((s) => s.agents);
  const loaded = useAgentStore((s) => s.loaded);
  const loading = useAgentStore((s) => s.loading);
  const target = resolveHandsOnAgent(targetAgentId, {
    agents,
    loaded,
    loading,
  });
  const agentSettings =
    surface === "agentApiAccess"
      ? handsOnAgentSettings(target, capabilities)
      : undefined;
  const known = isHandsOnSurface(surface);
  const openable =
    known &&
    (managerChat || !handsOnManagerOnly(surface)) &&
    handsOnSurfaceReachable(surface, gates, agentSettings);
  const inlineCard = openable ? inlineHandsOn(surface, managerChat) : null;
  const label = handsOnScreenLabel(
    { surface, agentId: targetAgentId },
    (id) => agents.find((a) => a.id === id)?.name,
  );
  const name =
    "name" in label ? t(label.key, { name: label.name }) : t(label.key);
  const inline = { ...chrome, stepId, reason, name, onFinished, onSkip };
  if (inlineCard === "apiKey")
    return (
      <ChatHandsOnApiKeyCard
        {...inline}
        keyName={agents.find((a) => a.id === keyNameAgentId)?.name ?? ""}
        ready={gates.ready}
      />
    );
  if (inlineCard === "agentApi")
    return (
      <ChatHandsOnAgentApiCard
        {...inline}
        agent={target.kind === "found" ? target.agent : null}
      />
    );
  const open = () =>
    openHandsOnSurface(surface as HandsOnSurface, targetAgentId);

  return (
    <ChatConnectStepShell
      {...chrome}
      busy={false}
      cta={
        openable ? (
          <>
            <Button
              className="gap-1.5"
              onClick={() => onFinished(name)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Check className="size-3.5" />
              {t("interaction.handsOnDone")}
            </Button>
            <Button className="gap-1.5" onClick={open} size="sm" type="button">
              {t("interaction.handsOnOpen")}
              <CornerDownLeft className="size-3.5 opacity-70" />
            </Button>
          </>
        ) : undefined
      }
      done={false}
      icon={<Hand className="size-5 shrink-0 text-ink" />}
      onDecline={(message) => onSkip(name, message)}
      onEnter={openable ? open : undefined}
      reason={reason ?? t("interaction.handsOnReason", { screen: name })}
      stepId={stepId}
      title={t("interaction.handsOnTitle", { screen: name })}
    >
      <p className="text-ink-muted text-sm">
        {openable
          ? t("interaction.handsOnExplainer")
          : known
            ? t("interaction.handsOnNotYours")
            : t("interaction.handsOnUnavailable")}
      </p>
    </ChatConnectStepShell>
  );
}
