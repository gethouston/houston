import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { Plus } from "lucide-react";

const AVATAR = 44;

export function TeamAvatarStack({
  colors,
  withOpenSeat = false,
}: {
  colors: readonly (string | undefined)[];
  withOpenSeat?: boolean;
}) {
  return (
    <span aria-hidden="true" className="flex items-center">
      {colors.map((color, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={index}
          className="-ml-3 rounded-full bg-background p-0.5 first:ml-0"
        >
          <HoustonAvatar color={resolveAgentColor(color)} diameter={AVATAR} />
        </span>
      ))}
      {withOpenSeat && (
        <span className="-ml-3 rounded-full bg-background p-0.5 first:ml-0">
          <span className="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-ink/25 text-ink-muted">
            <Plus className="size-5" />
          </span>
        </span>
      )}
    </span>
  );
}
