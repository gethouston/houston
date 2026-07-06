import { Avatar, AvatarFallback, Button } from "@houston-ai/core";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { isMultiplayer } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";
import { buildSharePeople, canShowAgentShareBlock } from "./agent-access-model";
import { AgentShareDialog } from "./agent-share-dialog";

const MAX_AVATARS = 4;

/**
 * The "Share this agent" block on an agent's General settings — the entry point
 * to the Drive-style {@link AgentShareDialog}. Shows a stack of avatars and a
 * count of the people who can use the agent, plus a Share button that opens the
 * dialog. Rendered only in multiplayer mode AND only for an agent-manager of
 * this agent (matrix v2): owner for any org agent; an admin only when their
 * effective `access` is `"manager"`. Single-player / self-host degrades to
 * nothing. The gateway enforces the same authority.
 */
export function AgentAccessSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const org = useOrg(isMultiplayer(capabilities));
  const [open, setOpen] = useState(false);

  if (!canShowAgentShareBlock(capabilities, agent)) return null;

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

      <AgentShareDialog agent={agent} open={open} onOpenChange={setOpen} />
    </section>
  );
}
