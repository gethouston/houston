import {
  HoustonAvatar,
  resolveAgentColor,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { openMissionChat } from "../lib/mission-chat";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";

/**
 * The phone's compose flow: a bottom sheet asking "which agent should run
 * this?", one row per agent; picking pushes that agent's empty draft chat
 * (`lib/mission-chat.ts`). Opened by `startNewMission`'s mobile fork — the
 * top bar's compose control and the board header's share it — and mounted
 * once at the shell level like the other global dialogs.
 */
export function MobileNewMissionSheet() {
  const { t } = useTranslation("dashboard");
  const open = useUIStore((s) => s.newMissionSheetOpen);
  const setOpen = useUIStore((s) => s.setNewMissionSheetOpen);
  const scopeIds = useUIStore((s) => s.newMissionSheetAgentIds);
  const roster = useAgentStore((s) => s.agents);
  // A board's compose scopes the question to the board's own agents; the top
  // bar's compose asks over everyone.
  const agents =
    scopeIds === null ? roster : roster.filter((a) => scopeIds.includes(a.id));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        data-testid="new-mission-sheet"
        className="max-h-[80dvh] rounded-t-2xl pb-safe"
      >
        <SheetHeader>
          <SheetTitle>{t("agentPicker.title")}</SheetTitle>
          <SheetDescription>{t("agentPicker.description")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="flex flex-col gap-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                data-testid="new-mission-sheet-agent"
                onClick={() => {
                  setOpen(false);
                  openMissionChat(agent, null);
                }}
                className="flex min-h-14 w-full items-center gap-4 rounded-2xl bg-chip p-3 text-left transition-colors active:scale-[0.98] hover:bg-hover"
              >
                <HoustonAvatar
                  color={resolveAgentColor(agent.color)}
                  diameter={40}
                />
                <span className="text-sm font-semibold text-ink">
                  {agent.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
