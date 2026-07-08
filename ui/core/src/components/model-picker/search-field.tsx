import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";

/** The always-visible search input. Typing bypasses the levels and drives the
 *  flat ranked results; clearing it returns to the current level. */
export function SearchField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (query: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
      <Search className="size-[18px] shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
        className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
