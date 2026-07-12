import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The "Add people" row of the Share dialog: a searchable picker over org
 * members who don't yet have access. Mirrors the toolkit picker (Popover +
 * Command) so the two read as one system. Picking a member adds them with
 * "Can use" access; the parent owns the write.
 */
export function AgentShareAddPeople({
  candidates,
  disabled,
  onAdd,
}: {
  /** Org members who do not yet have access. */
  candidates: OrgMember[];
  disabled?: boolean;
  onAdd: (member: OrgMember) => void;
}) {
  const { t } = useTranslation("teams");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || candidates.length === 0}
          className="inline-flex h-9 w-full cursor-pointer items-center gap-2 rounded-full border border-line bg-input px-3 text-sm text-ink-muted hover:bg-chip focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:opacity-50"
        >
          <Plus className="size-4" />
          <span>{t("share.addPeople")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command>
          <CommandInput placeholder={t("share.searchPeople")} />
          <CommandList>
            <CommandEmpty>{t("share.noPeople")}</CommandEmpty>
            {candidates.map((member) => {
              const name = member.email ?? member.userId;
              return (
                <CommandItem
                  key={member.userId}
                  value={name}
                  onSelect={() => {
                    onAdd(member);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{name}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
