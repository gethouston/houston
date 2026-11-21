import { ManagerAvatar, managerAvatarSizeWithin } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useManagerReachable } from "../../hooks/use-manager-reachable";
import { useUIStore } from "../../stores/ui";
import { ASSISTANT_VIEW_ID } from "../assistant/id";
import { FRONT_DIAMETER } from "./agent-avatar-stack";

export function ManagerHomeRow() {
  const { t } = useTranslation("shell");
  const reachable = useManagerReachable();
  const setViewMode = useUIStore((s) => s.setViewMode);
  if (!reachable) return null;
  return (
    <div className="mx-4 border-b border-line">
      <button
        type="button"
        data-testid="agents-home-manager"
        onClick={() => setViewMode(ASSISTANT_VIEW_ID, { nav: "push" })}
        className="flex w-full items-center gap-3 text-left transition-colors hover:bg-hover active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <span className="flex size-14 shrink-0 items-center justify-center">
          <ManagerAvatar size={managerAvatarSizeWithin(FRONT_DIAMETER)} />
        </span>
        <span className="flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="truncate text-base font-weight-510 text-ink">
            {t("sidebar.assistant")}
          </span>
          <span className="truncate text-sm text-ink-muted">
            {t("sidebar.assistantRole")}
          </span>
        </span>
      </button>
    </div>
  );
}
