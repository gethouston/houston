import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../../lib/types";

/** Shared props for every Agent Settings drill-in screen. */
export interface AgentAdminScreenProps {
  agent: Agent;
  onBack: () => void;
}

/** The "← Agent settings" back bar returning a drill-in screen to the landing. */
export function AgentAdminBackBar({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation("teams");
  return (
    <div className="shrink-0 px-8 pt-8 pb-2">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t("agentAdmin.title")}
      </button>
    </div>
  );
}

/**
 * Full-pane shell for a drill-in screen: the back bar plus a scrolling content
 * area. The reused editors handle their own max-width, so the shell adds none.
 */
export function AgentAdminScreenShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 flex min-h-0 flex-col">
      <AgentAdminBackBar onBack={onBack} />
      <div className="flex-1 overflow-y-auto flex flex-col">{children}</div>
    </div>
  );
}
