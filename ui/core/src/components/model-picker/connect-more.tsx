import { Command as CommandPrimitive } from "cmdk";
import { Plus } from "lucide-react";

/** The quiet footer affordance that opens the provider-connection surface. A
 *  cmdk item so it stays reachable by ↑↓/Enter (no hover-only affordances). */
export function ConnectMore({
  label,
  onSelect,
}: {
  label: string;
  onSelect: () => void;
}) {
  return (
    <CommandPrimitive.Item
      value="__connect_more__"
      keywords={[label]}
      onSelect={onSelect}
      className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border-t border-border/60 px-3 py-2.5 text-xs font-medium text-muted-foreground outline-none data-[selected=true]:bg-accent data-[selected=true]:text-foreground"
    >
      <Plus className="size-4 shrink-0" />
      {label}
    </CommandPrimitive.Item>
  );
}
