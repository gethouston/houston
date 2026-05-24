import { useTranslation } from "react-i18next";
import {
  AGENT_COLORS,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  colorHex,
} from "@houston-ai/core";

const AGENT_COLOR_LABEL_KEYS: Record<string, AgentColorLabelKey> = {
  charcoal: "shell:sidebar.colorLabels.charcoal",
  forest: "shell:sidebar.colorLabels.forest",
  navy: "shell:sidebar.colorLabels.navy",
  purple: "shell:sidebar.colorLabels.purple",
  crimson: "shell:sidebar.colorLabels.crimson",
  orange: "shell:sidebar.colorLabels.orange",
  golden: "shell:sidebar.colorLabels.golden",
};

type AgentColorLabelKey =
  | "shell:sidebar.colorLabels.charcoal"
  | "shell:sidebar.colorLabels.forest"
  | "shell:sidebar.colorLabels.navy"
  | "shell:sidebar.colorLabels.purple"
  | "shell:sidebar.colorLabels.crimson"
  | "shell:sidebar.colorLabels.orange"
  | "shell:sidebar.colorLabels.golden";

interface AgentSidebarColorMenuProps {
  color?: string;
  onChange: (color: string) => void;
}

export function AgentSidebarColorMenu({
  color,
  onChange,
}: AgentSidebarColorMenuProps) {
  const { t } = useTranslation("shell");

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {t("sidebar.changeColor")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={agentColorValue(color)}
          onValueChange={onChange}
        >
          {AGENT_COLORS.map((entry) => (
            <DropdownMenuRadioItem key={entry.id} value={entry.id}>
              <span
                aria-hidden="true"
                className="size-3 rounded-full"
                style={{ backgroundColor: colorHex(entry) }}
              />
              {t(
                AGENT_COLOR_LABEL_KEYS[entry.id] ??
                  "shell:sidebar.colorLabels.charcoal",
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function agentColorValue(color: string | undefined): string {
  const match = AGENT_COLORS.find(
    (entry) =>
      entry.id === color || entry.light === color || entry.dark === color,
  );
  return match?.id ?? AGENT_COLORS[0].id;
}
