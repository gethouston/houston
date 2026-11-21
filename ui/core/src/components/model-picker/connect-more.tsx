import { Plus } from "lucide-react";
import { CommandItem } from "../command";

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
      className="mt-1 border-t border-line/60 text-ink-muted data-[selected=true]:text-ink"
    >
      <Plus className="size-4 shrink-0" />
      {label}
    </CommandItem>
  );
}
