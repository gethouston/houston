import { Plus } from "lucide-react";
import { CommandItem } from "../command";

/** The quiet footer affordance that opens the provider-connection surface. A
 *  `CommandItem` so it stays reachable by ↑↓/Enter (no hover-only affordances). */
export function ConnectMore({
  label,
  onSelect,
}: {
  label: string;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value="__connect_more__"
      keywords={[label]}
      onSelect={onSelect}
      className="mt-1 border-t border-border/60 text-muted-foreground data-[selected=true]:text-foreground"
    >
      <Plus className="size-4 shrink-0" />
      {label}
    </CommandItem>
  );
}
