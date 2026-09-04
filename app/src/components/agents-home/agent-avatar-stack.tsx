import { cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import type { ReactNode } from "react";

/** The front avatar's diameter: the phone list's large, WhatsApp-sized mark. */
const FRONT_DIAMETER = 52;
/** The two cards fanned out behind it are a step smaller, so the fan reads as
 *  depth rather than as three agents. */
const BACK_DIAMETER = 46;

/**
 * The phone Agents home's avatar: the agent's helmet, large, and — when the
 * agent holds several conversations — fanned out as a STACK of three cards,
 * the front one straight and two tilted behind it to its left. The fan is the
 * row's way of saying "there is more than one thing in here" before the user
 * taps; an agent with at most one task wears a single mark, because a stack
 * over one conversation would promise a list that is not there.
 *
 * The back cards are the same helmet in the same colour, each on its own
 * opaque disc so the three read as separate solid cards where they overlap. Decorative: the row's text names the agent and counts its
 * work, so the whole mark is hidden from assistive tech.
 *
 * The running ring rides the front card only, through `HoustonAvatar`'s own
 * `running` treatment, so the one "something is running here" ring the rail
 * draws is the one drawn here.
 */
export function AgentAvatarStack({
  color,
  running,
  stacked,
  className,
}: {
  color?: string;
  running: boolean;
  /** Fan the mark out into three cards. */
  stacked: boolean;
  className?: string;
}) {
  const resolved = resolveAgentColor(color);
  return (
    <span
      aria-hidden
      data-testid="agent-avatar-stack"
      data-stacked={stacked ? "true" : "false"}
      className={cn(
        "relative flex size-14 shrink-0 items-center justify-center",
        className,
      )}
    >
      {stacked && (
        <>
          <span className="absolute inset-0 flex -translate-x-3 -rotate-[14deg] items-center justify-center">
            <Card>
              <HoustonAvatar color={resolved} diameter={BACK_DIAMETER} />
            </Card>
          </span>
          <span className="absolute inset-0 flex -translate-x-1.5 -rotate-[7deg] items-center justify-center">
            <Card>
              <HoustonAvatar color={resolved} diameter={BACK_DIAMETER} />
            </Card>
          </span>
        </>
      )}
      <Card className="relative">
        <HoustonAvatar
          color={resolved}
          diameter={FRONT_DIAMETER}
          running={running}
        />
      </Card>
    </span>
  );
}

/**
 * An OPAQUE disc under each card. The avatar's own tint is a translucent mix
 * over the chip surface, so on its own a card behind shows through the one in
 * front and the fan reads as a ghost; the screen's background underneath, plus
 * a hairline of it as the card's edge, is what makes each card solid.
 */
function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex rounded-full bg-background ring-2 ring-background",
        className,
      )}
    >
      {children}
    </span>
  );
}
