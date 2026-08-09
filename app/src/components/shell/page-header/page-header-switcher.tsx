import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { headerLozengeClasses, headerLozengeTrack } from "./header-lozenge";

export function PageHeaderSwitcher<Id extends string>({
  identity,
  items,
  active,
  label,
  onSelect,
  dataAttrs,
}: {
  identity: ReactNode;
  items: { id: Id; label: ReactNode; dataAttrs?: Record<string, string> }[];
  active: Id;
  label: string;
  onSelect: (id: Id) => void;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <DropdownMenu>
      {/* The heading stays on the identity trigger at every width. The lone
          pill keeps its track: without it, the white active fill would float
          invisibly on a light page. */}
      <h1 className={headerLozengeTrack("min-w-0")}>
        <DropdownMenuTrigger
          aria-label={label}
          {...dataAttrs}
          className={headerLozengeClasses(true)}
        >
          {identity}
          <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
      </h1>
      <DropdownMenuContent align="start">
        {items.map((item) => (
          <DropdownMenuCheckboxItem
            key={item.id}
            checked={item.id === active}
            {...item.dataAttrs}
            onSelect={() => onSelect(item.id)}
          >
            {item.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
