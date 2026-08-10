import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateAgentTeam,
  useOrg,
  useSetAgentTeamMemberOwner,
} from "../../hooks/queries";
import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import { useUIStore } from "../../stores/ui";
import { AgentShareAddPeople } from "../agent/agent-share-add-people";
import { buildTeamIdentityChoices } from "./team-identity";
import { TeamIdentityNameRow } from "./team-identity-name-row";
import { teamNameTooLong } from "./team-identity-save";

export function CreateAgentTeamDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverBacked: boolean;
  sidebar: UseSidebarLayout;
}) {
  const { t } = useTranslation(["teams", "shell", "common"]);
  const choices = useMemo(() => buildTeamIdentityChoices(t), [t]);
  const create = useCreateAgentTeam();
  const addMember = useSetAgentTeamMemberOwner();
  const { data: org } = useOrg(props.serverBacked);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>();
  const [color, setColor] = useState<string>();
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const trimmed = name.trim();
  const tooLong = teamNameTooLong(name);

  const close = () => {
    props.onOpenChange(false);
    setName("");
    setIcon(undefined);
    setColor(undefined);
    setMemberIds([]);
  };
  const openTeamView = useUIStore((s) => s.openTeamView);
  const submit = async () => {
    if (!trimmed || tooLong || create.isPending) return;
    let createdId: string | null = null;
    if (props.serverBacked) {
      const team = await create.mutateAsync({ name: trimmed, icon, color });
      for (const userId of memberIds) {
        await addMember.mutateAsync({ teamId: team.id, userId, owner: false });
      }
      createdId = team.id;
    } else {
      const id = props.sidebar.createGroup(trimmed);
      if (id) props.sidebar.setGroupIdentity(id, { icon, color });
      createdId = id;
    }
    close();
    // You made a place; you land in it (the Linear grammar). Landing on the
    // empty board is also what makes the next step obvious: add an agent.
    if (createdId) openTeamView(createdId, "mission-control");
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("teams:agentTeams.create.title")}</DialogTitle>
        </DialogHeader>
        <TeamIdentityNameRow
          icon={icon}
          colorId={color}
          name={name}
          choices={choices}
          onIconChange={setIcon}
          onColorChange={setColor}
          onNameChange={setName}
        />
        {props.serverBacked && org?.members && (
          <div>
            <p className="mb-2 text-sm text-ink-muted">
              {t("teams:agentTeams.create.members")}
            </p>
            <AgentShareAddPeople
              candidates={org.members.filter(
                (member) => !memberIds.includes(member.userId),
              )}
              onAdd={(member) =>
                setMemberIds((current) => [...current, member.userId])
              }
            />
            {memberIds.length > 0 && (
              <p className="mt-2 text-xs text-ink-muted">
                {t("teams:agentTeams.create.membersSelected", {
                  count: memberIds.length,
                })}
              </p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!trimmed || tooLong || create.isPending}
          >
            {t("teams:agentTeams.create.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
