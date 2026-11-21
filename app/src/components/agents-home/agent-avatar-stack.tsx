import { cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import type { ReactNode } from "react";

export const FRONT_DIAMETER = 52;
const BACK_DIAMETER = 46;

export function AgentAvatarStack({
  color,
  running,
  stacked,
  className,
}: {
  color?: string;
  running: boolean;
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
