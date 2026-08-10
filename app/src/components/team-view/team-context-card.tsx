import { useTranslation } from "react-i18next";
import { useSetAgentTeamContext } from "../../hooks/queries/use-agent-teams";
import {
  useSidebarLayout,
  useSidebarLayoutValue,
} from "../../hooks/use-sidebar-layout";
import type { TeamView } from "../../lib/teams-model";
import { useWorkspaceStore } from "../../stores/workspaces";
import {
  TeamContextEditor,
  type TeamContextEditorLabels,
} from "./team-context-editor.tsx";
import { canEditTeamContext, teamContextSource } from "./team-context-model.ts";

/** The card's copy, read once and handed to whichever branch mounts. */
function useContextLabels(): TeamContextEditorLabels {
  const { t } = useTranslation("teams");
  return {
    title: t("teamView.context.title"),
    explainer: t("teamView.context.explainer"),
    placeholder: t("teamView.context.placeholder"),
  };
}

/**
 * A NAMED local team's context: the stored sidebar group's own `context` field.
 * Saving writes the layout, and the host mirrors the result into every member
 * agent's `GROUP.md` on that same write (`routes/group-context-sync.ts`) — so
 * the promise the card makes is kept by a path that already existed. This card
 * replaced the rail's "Edit shared context" dialog, which is deleted: one door.
 *
 * `useSidebarLayout` is taken WITHOUT the server-teams normalizer, which is
 * correct precisely because this branch is unreachable on an `agentTeams` host:
 * there the stored layout is an ordering overlay and the team's context is the
 * gateway's, so {@link ServerTeamContext} mounts instead.
 */
function GroupTeamContext({
  groupId,
  content,
  labels,
  readOnly,
}: {
  groupId: string;
  content: string;
  labels: TeamContextEditorLabels;
  readOnly: boolean;
}) {
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const sidebar = useSidebarLayout(workspaceId);
  return (
    <TeamContextEditor
      content={content}
      readOnly={readOnly}
      labels={labels}
      onSave={async (next) => sidebar.setGroupContext(groupId, next)}
    />
  );
}

/**
 * The LOCAL default team's context: the layout's `defaultContext`, which the
 * host fans out to the `GROUP.md` of every agent in no named team — the SAME
 * write and the SAME mechanism {@link GroupTeamContext} uses, one field over.
 *
 * It is not `WORKSPACE.md`, which this branch used to write. That file belongs
 * to the workspace and reaches every agent in it, named team or not, so writing
 * it here made the card's sentence false the moment a second agent sat in the
 * default team: the user was editing one agent's workspace file and being told
 * a whole team knew it.
 */
function DefaultTeamContext({
  content,
  labels,
  readOnly,
}: {
  content: string;
  labels: TeamContextEditorLabels;
  readOnly: boolean;
}) {
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const sidebar = useSidebarLayout(workspaceId);
  return (
    <TeamContextEditor
      content={content}
      readOnly={readOnly}
      labels={labels}
      onSave={async (next) => sidebar.setDefaultContext(next)}
    />
  );
}

/** A SERVER team's context: the gateway's own field, written optimistically so
 *  a save-on-blur never repaints the box under the user's cursor. */
function ServerTeamContext({
  teamId,
  content,
  labels,
  readOnly,
}: {
  teamId: string;
  content: string;
  labels: TeamContextEditorLabels;
  readOnly: boolean;
}) {
  const update = useSetAgentTeamContext();
  return (
    <TeamContextEditor
      content={content}
      readOnly={readOnly}
      labels={labels}
      onSave={(next) => update.mutateAsync({ teamId, context: next })}
    />
  );
}

/**
 * The FIRST card of a team's Manage agents page: the context every agent in
 * this team is given before it starts a turn.
 *
 * It leads the page because it is the only thing there that changes how the
 * team's agents BEHAVE — the roster below it says who is in the team, this says
 * what they all know. One card, three stores behind it
 * ({@link teamContextSource}), and the user is never shown which: the sentence
 * "every agent in this team knows this" has to be true on a laptop and in a
 * shared space alike, so the surface cannot differ between them either.
 *
 * Renders nothing at all in exactly one case — a server host whose gateway does
 * not serve the field yet — because an editor that saves into a `400` is worse
 * than no editor.
 */
export function TeamContextCard({ team }: { team: TeamView }) {
  const labels = useContextLabels();
  // The default team's context lives on the LAYOUT (it owns no group row), so
  // the read happens here, above the branch: read-only, memoized, and the same
  // query the rail already holds — a server team simply never looks at it.
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const layout = useSidebarLayoutValue(workspaceId);
  const source = teamContextSource(team, layout.defaultContext);
  if (source === null) return null;
  const readOnly = !canEditTeamContext(team);

  if (source.kind === "default")
    return (
      <DefaultTeamContext
        content={source.content}
        labels={labels}
        readOnly={readOnly}
      />
    );
  if (source.kind === "group")
    return (
      <GroupTeamContext
        groupId={team.id}
        content={source.content}
        labels={labels}
        readOnly={readOnly}
      />
    );
  return (
    <ServerTeamContext
      teamId={team.id}
      content={source.content}
      labels={labels}
      readOnly={readOnly}
    />
  );
}
