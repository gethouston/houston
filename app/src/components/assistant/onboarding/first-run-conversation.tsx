import { type ReactNode, useEffect, useState } from "react";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { useProviderStatuses } from "../../../hooks/use-provider-statuses";
import { useSession } from "../../../hooks/use-session";
import { useSurfaceGates } from "../../../hooks/use-surface-gates";
import {
  earlierHireIds,
  earlierHires,
} from "../../../lib/manager-onboarding/earlier-hires";
import { firstNameOf } from "../../../lib/manager-onboarding/first-name";
import { managerReach } from "../../../lib/manager-onboarding/manager-reach";
import {
  changeableAnswer,
  firstRunScript,
  type ScriptReceipt,
  type SurveyQuestion,
} from "../../../lib/manager-onboarding/script";
import {
  surveyAbout,
  surveyAnswered,
} from "../../../lib/manager-onboarding/survey-script";
import {
  TEAM_CONVERSATION_START,
  teamAnswer,
  teamFinished,
  teamUndo,
} from "../../../lib/manager-onboarding/team-script";
import { useAgentStore } from "../../../stores/agents";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { ConnectAiCard } from "../../onboarding/connect-ai-card";
import { connectedProviderId } from "../../onboarding/connect-ai-card-state";
import {
  isSurveyQuestion,
  ONBOARDING_SURVEY_STEPS,
} from "../../onboarding/survey-steps";
import { ManagerChat } from "./manager-chat";
import type { ManagerOnboardingState } from "./manager-onboarding-context";
import { ManagerSurveyCard } from "./manager-survey-card";
import { ManagerTeamPrompt } from "./manager-team-prompt";
import { useGoalHandoff } from "./use-goal-handoff";
import { useFinishWithTranscript } from "./use-onboarding-transcript";
import { useScriptCopy } from "./use-script-copy";

type FirstRun = Extract<ManagerOnboardingState, { mode: "first_run" }>;

export function FirstRunConversation({ state }: { state: FirstRun }) {
  const copy = useScriptCopy();
  const { capabilities } = useCapabilities();
  const { showAssistant } = useSurfaceGates();
  const reach = showAssistant ? managerReach(capabilities) : null;
  const { data: session } = useSession();
  const scan = useProviderStatuses();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const agents = useAgentStore((s) => s.agents);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const [editing, setEditing] = useState<SurveyQuestion | null>(null);
  const [team, setTeam] = useState(TEAM_CONVERSATION_START);
  const [teamBusy, setTeamBusy] = useState(false);
  const [earlierIds, setEarlierIds] = useState<ReadonlySet<string> | null>(
    null,
  );
  useEffect(() => {
    if (state.stage === "team" && agentsLoaded && earlierIds === null)
      setEarlierIds(earlierHireIds(agents));
  }, [state.stage, agentsLoaded, earlierIds, agents]);
  const earlier = earlierHires(agents, earlierIds);

  const record = state.survey.survey;
  const loading =
    state.stage === "team" && (workspaceId === null || earlierIds === null);
  const script = firstRunScript({
    stage: state.stage,
    firstName: firstNameOf(session?.displayName),
    loading,
    providerId: connectedProviderId(scan),
    survey: record,
    editing,
    earlierHires: earlier.length,
    team,
    reach,
  });
  const finishing = useFinishWithTranscript(
    "first_run",
    script.lines,
    copy,
    state.finish,
  );
  const facts = surveyAbout(record);
  const industry =
    facts.industry ??
    team.entries.findLast((entry) => entry.question === "teamIndustry")
      ?.value ??
    null;
  const startGoal = useGoalHandoff({
    goal: record?.automationGoal ?? null,
    about: {
      industry: industry === null ? null : copy.answer("industry", industry),
      role: facts.role === null ? null : copy.answer("role", facts.role),
      companySize: facts.companySize,
    },
    reach,
    finish: finishing.done,
  });
  const missing = ONBOARDING_SURVEY_STEPS.filter(
    (question) => !surveyAnswered(record, question),
  );
  const change = (line: ScriptReceipt) => {
    if (isSurveyQuestion(line.question)) setEditing(line.question);
    else setTeam(teamUndo);
  };
  const changeable = teamBusy ? null : changeableAnswer(script.lines);
  const back = changeable ? () => change(changeable) : null;

  let prompt: ReactNode = null;
  if (script.prompt.kind === "connectAi") prompt = <ConnectAiCard />;
  if (script.prompt.kind === "survey")
    prompt = (
      <ManagerSurveyCard
        mode="first_run"
        question={script.prompt.question}
        survey={state.survey}
        copy={copy}
        onBack={back}
        onAnswered={(question) => {
          setEditing(null);
          if (missing.every((left) => left === question)) state.onSurveyDone();
        }}
      />
    );
  if (script.prompt.kind === "team" && workspaceId !== null)
    prompt = (
      <ManagerTeamPrompt
        workspaceId={workspaceId}
        conversation={team}
        earlierHires={earlier}
        copy={copy}
        onAnswer={(answer, next) =>
          setTeam((current) => teamAnswer(current, answer, next))
        }
        onBack={back}
        onBusy={setTeamBusy}
        onFinished={(closing) =>
          setTeam((current) => teamFinished(current, closing))
        }
      />
    );
  return (
    <ManagerChat
      lines={script.lines}
      copy={copy}
      prompt={prompt}
      locked={teamBusy}
      onChange={change}
      onSaid={script.prompt.kind === "openChat" ? startGoal : undefined}
    />
  );
}
