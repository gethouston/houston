import type { TeamView } from "../../lib/teams-model";
import { PageContainer } from "../shell/page-shell";
import { TeamContextCard } from "./team-context-card";

export function TeamContextPane({ team }: { team: TeamView }) {
  return (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="flex h-full min-h-0 flex-col pt-8">
        <TeamContextCard team={team} />
      </PageContainer>
    </div>
  );
}
