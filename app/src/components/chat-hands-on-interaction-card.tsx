import type { StepChrome } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import type { HandsOnSurface } from "@houston/protocol";
import { isHandsOnSurface } from "@houston/protocol";
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
  /** The screen the agent is handing over, straight off the wire. */
  surface: string;
  /** The employee the screen belongs to (`agentApiAccess`), off the wire. */
  targetAgentId?: string;
  /** The employee a key minted here is for (a sibling `agentApiAccess` step),
   *  which the key's name defaults to. */
  keyNameAgentId?: string;
  /** The AI Manager's own chat: the only place the API errands run inline. */
  managerChat: boolean;
  reason?: string;
  /** The user says they finished on the screen; carries its display name. */
  onFinished: (name: string) => void;
  onSkip: (name: string, message?: string) => void;
}

/**
 * The errand card: "open this screen, do the thing there, come back".
 *
 * It covers every task only the person's own hands can finish — a card on file,
 * a key Houston reveals once, files on their device, a space they alone may
 * destroy — because all of them are the same interaction and none of them can
 * carry a result back through the runtime.
 *
 * Nothing here can OBSERVE completion, which is what separates it from the
 * connect cards: no status poll can tell whether the person actually paid. So
 * the card asks instead of pretending, and both answers stand side by side from
 * the start — Open takes them to the screen, Done and Skip are the two honest
 * ways back. Open NAVIGATES, which tears this card down and rebuilds it when
 * the person returns, so the card keeps no state of its own: the outcome log
 * behind the stepper is the memory, and re-answering simply overwrites it.
 *
 * A screen this build does not know (a newer engine named it), and one this
 * person's own Houston does not hold (Billing for a plain member, the Danger
 * zone for anyone but the space owner), both say so and leave Skip as the way
 * on, rather than offering a button to nowhere.
 *
 * In the AI Manager's chat the two API errands do their job INLINE instead
 * (people dislike being sent out of the chat): a key is created and copied
 * right in the card, and an employee's IDs and setup prompt are shown there.
 * Anywhere else `apiKeys` keeps navigating ({@link inlineHandsOn}).
 */
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
  // Only an employee's own screen asks whose it is: its Settings are drawn for
  // its managers alone, so anyone else would land on nothing.
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
