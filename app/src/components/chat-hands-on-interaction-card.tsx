import type { HandsOnSurface } from "@houston/protocol";
import { isHandsOnSurface } from "@houston/protocol";
import type { StepChrome } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { Check, CornerDownLeft, Hand } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSurfaceGates } from "../hooks/use-surface-gates";
import { handsOnSurfaceReachable } from "../lib/hands-on-gates";
import {
  handsOnScreenKey,
  openHandsOnSurface,
} from "../lib/hands-on-navigation";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";

interface Props extends StepChrome, StepDraftApi {
  stepId: string;
  /** The screen the agent is handing over, straight off the wire. */
  surface: string;
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
 */
export function ChatHandsOnInteractionCard({
  stepId,
  surface,
  reason,
  onFinished,
  onSkip,
  ...chrome
}: Props) {
  const { t } = useTranslation("chat");
  const gates = useSurfaceGates();
  const known = isHandsOnSurface(surface);
  const openable = known && handsOnSurfaceReachable(surface, gates);
  const name = known
    ? t(handsOnScreenKey(surface as HandsOnSurface))
    : t("interaction.handsOnUnknownScreen");
  const open = () => openHandsOnSurface(surface as HandsOnSurface);

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
