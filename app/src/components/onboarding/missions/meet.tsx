import type { FormEvent } from "react";
import { Check } from "lucide-react";
import {
  AGENT_COLORS,
  Button,
  HoustonAvatar,
  Input,
  cn,
  colorHex,
  resolveAgentColor,
} from "@houston-ai/core";

interface MeetMissionProps {
  name: string;
  color: string;
  namePlaceholder: string;
  beginLabel: string;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  onBegin: () => void;
}

export function MeetMission({
  name,
  color,
  namePlaceholder,
  beginLabel,
  onNameChange,
  onColorChange,
  onBegin,
}: MeetMissionProps) {
  const trimmed = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed) onBegin();
  };
  return (
    <form
      onSubmit={submit}
      className="mx-auto flex w-full max-w-sm flex-col items-center gap-6"
    >
      <HoustonAvatar color={resolveAgentColor(color)} diameter={96} />
      <Input
        autoFocus
        value={name}
        placeholder={namePlaceholder}
        className="rounded-full text-center"
        onChange={(event) => onNameChange(event.target.value)}
      />
      <div className="flex items-center gap-2">
        {AGENT_COLORS.map((item) => {
          const selected =
            color === item.id || color === item.light || color === item.dark;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              aria-label={item.id}
              onClick={() => onColorChange(item.id)}
              className={cn(
                "flex size-7 items-center justify-center rounded-full transition-transform",
                selected
                  ? "ring-2 ring-foreground/30 ring-offset-2"
                  : "hover:scale-110",
              )}
              style={{ backgroundColor: colorHex(item) }}
            >
              {selected && <Check className="size-3.5 text-white" />}
            </button>
          );
        })}
      </div>
      <Button type="submit" disabled={!trimmed} className="w-full rounded-full">
        {beginLabel}
      </Button>
    </form>
  );
}
