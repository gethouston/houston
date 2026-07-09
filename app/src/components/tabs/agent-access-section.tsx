import { Avatar, AvatarFallback, Button } from "@houston-ai/core";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { isTeamWorkspace } from "../../lib/space-id";
import type { Agent } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaces";
import { agentShareSurface, buildSharePeople } from "./agent-access-model";
import { AgentShareSurfaces } from "./agent-share-surfaces";

const MAX_AVATARS = 4;

/**
 * The "Share this agent" block on an agent's General settings. Its shape depends
 * on the active space (C8 §Share-triggers-team, `agentShareSurface`) and opens
 * the SAME flows as the prominent header Share button via {@link
 * AgentShareSurfaces}:
 *
 * - `manage` (TEAM space, agent-manager) → the Drive-style share dialog: add
 *   teammates and pick who can manage (unchanged from Teams v2).
 * - `inviteTeam` (PERSONAL space on a spaces-capable host) → an "invite your
 *   team" entry; a personal space is non-invitable, so the only way to share is
 *   to move the agent into a team first.
 * - Otherwise (`view` never reaches this manager-only tab, or `none` on
 *   desktop / self-host) → nothing.
 *
 * The gateway enforces the same authority; these gates only shape affordances.
 */
export function AgentAccessSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const current = useWorkspaceStore((s) => s.current);
  const inPersonalSpace = !isTeamWorkspace(current?.id ?? "");
  const surface = agentShareSurface(capabilities, agent, inPersonalSpace);
  const org = useOrg(surface === "manage");
  const [open, setOpen] = useState(false);

  if (surface === "none" || surface === "view") return null;

  if (surface === "inviteTeam") {
    return (
      <section>
        <h2 className="mb-1 text-lg font-semibold">
          {t("share.sectionTitle")}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("shareViaTeam.sectionHelper")}
        </p>

        <Button
          variant="secondary"
          className="rounded-full"
          onClick={() => setOpen(true)}
        >
          <UserPlus className="size-4" />
          {t("shareViaTeam.button")}
        </Button>

        <AgentShareSurfaces
          agent={agent}
          surface="inviteTeam"
          open={open}
          onOpenChange={setOpen}
        />
      </section>
    );
  }

  const selfId = session?.user?.id ?? null;
  const members = org.data?.members ?? [];
  const people = buildSharePeople({ agent, members, selfId });
  const shown = people.slice(0, MAX_AVATARS);
  const overflow = people.length - shown.length;

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">{t("share.sectionTitle")}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {t("share.sectionHelper")}
      </p>

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          className="rounded-full"
          onClick={() => setOpen(true)}
        >
          <UserPlus className="size-4" />
          {t("share.button")}
        </Button>

        {people.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {shown.map((person) => (
                <Avatar
                  key={person.userId}
                  size="sm"
                  className="ring-2 ring-background"
                >
                  <AvatarFallback>
                    {(person.email ?? person.userId).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {overflow > 0 && (
                <Avatar size="sm" className="ring-2 ring-background">
                  <AvatarFallback className="text-xs">
                    {t("share.overflow", { count: overflow })}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {t("share.peopleCount", { count: people.length })}
            </span>
          </div>
        )}
      </div>

      <AgentShareSurfaces
        agent={agent}
        surface="manage"
        open={open}
        onOpenChange={setOpen}
      />
    </section>
  );
}
