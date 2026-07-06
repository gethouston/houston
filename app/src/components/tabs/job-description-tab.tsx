import { useEffect, useState } from "react";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { AgentAdminLanding } from "./agent-admin/agent-admin-landing";
import {
  type AgentAdminScreen,
  targetToScreen,
} from "./agent-admin/agent-admin-nav.ts";
import { AgentAdminScreenView } from "./agent-admin/agent-admin-screen";

/**
 * The manager-only Agent Settings tab, rebuilt as a Settings-style admin page: a
 * landing of grouped cards ({@link AgentAdminLanding}) whose rows drill into a
 * full-pane screen with a back bar. Only agent-managers / owners (or the
 * single-player sole user) ever reach this tab, so every screen is editable —
 * the old read-only "managed agent" plumbing is gone. A turn-summary file link
 * deep-links straight into the matching screen via the UI store target.
 */
export default function JobDescriptionTab({ agent }: TabProps) {
  const [screen, setScreen] = useState<AgentAdminScreen | null>(null);
  const target = useUIStore((s) => s.jobDescriptionTarget);
  const setTarget = useUIStore((s) => s.setJobDescriptionTarget);

  useEffect(() => {
    if (!target) return;
    setScreen(targetToScreen(target));
    setTarget(null);
  }, [target, setTarget]);

  if (screen === null) {
    return (
      <div className="flex-1 overflow-y-auto">
        <AgentAdminLanding agent={agent} onSelect={setScreen} />
      </div>
    );
  }

  return (
    <AgentAdminScreenView
      agent={agent}
      screen={screen}
      onBack={() => setScreen(null)}
    />
  );
}
