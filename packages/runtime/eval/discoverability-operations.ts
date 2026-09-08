/**
 * The requests that MUST reach an operation. One line of everyday speech per
 * capability the assistant is expected to find - never the operation's own
 * vocabulary, because the model reading the map is the thing being tested.
 *
 * Shape and rationale: {@link ./discoverability-cases.ts}.
 */
import type { DiscoverabilityCase } from "./discoverability-cases";

export const OPERATION_CASES: readonly DiscoverabilityCase[] = [
  {
    id: "delete-mission",
    request:
      "Delete the mission about the tax report, I started it by mistake.",
    operations: ["deleteActivity"],
  },
  {
    id: "list-board",
    request: "What is on Luna's board right now?",
    operations: ["listActivities"],
  },
  {
    id: "add-mission-without-running",
    request: "Put a task on Dobby's board for later, but do not start it yet.",
    operations: ["createActivity"],
  },
  {
    id: "list-agents",
    request: "Which agents do I have?",
    operations: ["listAgents"],
  },
  {
    id: "rename-agent",
    request: "Call my Dobby agent Winnie instead.",
    operations: ["renameAgent"],
  },
  {
    id: "recolour-agent",
    request: "Make Dobby blue.",
    operations: ["updateAgentColor"],
  },
  {
    id: "create-agent",
    request: "I need someone to handle my bookkeeping.",
    operations: ["createAgent"],
  },
  {
    id: "delete-agent",
    request: "Get rid of the agent I called Test, I do not need it.",
    operations: ["deleteAgent"],
  },
  {
    id: "which-model",
    request: "Which AI is Dobby running on?",
    operations: ["getAgentModelChoice"],
  },
  {
    id: "switch-model",
    request: "Put Dobby on Opus from now on.",
    operations: ["setAgentModelChoice"],
  },
  {
    id: "list-providers",
    request: "Which AI accounts are connected here?",
    operations: ["listAgentProviders"],
  },
  {
    id: "install-agent",
    request: "Install this agent from GitHub for me.",
    operations: ["installAgentFromGithub"],
  },
  {
    id: "create-routine",
    request: "Every Monday at nine, have Luna send me the week's numbers.",
    operations: ["createRoutine"],
  },
  {
    id: "move-routine",
    request: "Move my weekly report to Fridays instead of Mondays.",
    operations: ["updateRoutine"],
  },
  {
    id: "stop-routine",
    request: "Stop the daily digest from running, I do not want it anymore.",
    operations: ["deleteRoutine"],
  },
  {
    id: "run-routine-now",
    request: "Run the weekly report right now, do not wait for Monday.",
    operations: ["runRoutineNow"],
  },
  {
    id: "list-routines",
    request: "What is scheduled to run automatically?",
    operations: ["listRoutines"],
  },
  {
    id: "routine-history",
    request: "Did the weekly report actually run last week?",
    operations: ["listRoutineRuns"],
  },
  {
    id: "cancel-routine-run",
    request: "The report that is running now is wrong, stop this run.",
    operations: ["cancelRoutineRun"],
  },
  {
    id: "invite-person",
    request: "Add maria@example.com to my space.",
    operations: ["addOrgMember"],
  },
  {
    id: "remove-person",
    request: "Tom has left, take him out of the space.",
    operations: ["removeOrgMember"],
  },
  {
    id: "change-role",
    request: "Make Ana an admin so she can manage the agents.",
    operations: ["setOrgMemberRole"],
  },
  {
    id: "list-people",
    request: "Who else is in here with me?",
    operations: ["getOrgPeople"],
  },
  {
    id: "cancel-invite",
    request: "Cancel the invitation I sent to Pedro.",
    operations: ["deleteOrgInvite"],
  },
  {
    id: "usage",
    request: "How much have we used this month?",
    operations: ["orgUsage", "computeUsage"],
  },
  {
    id: "upgrade",
    request: "I want to move to a bigger plan.",
    operations: ["createCheckout"],
  },
  {
    id: "billing-status",
    request: "What am I paying for right now?",
    operations: ["getBilling"],
  },
  {
    id: "list-skills",
    request: "What can Dobby already do?",
    operations: ["listSkills", "getSkillsManifest"],
  },
  {
    id: "disable-skill",
    request: "Turn off the invoice skill for Dobby.",
    operations: ["putSkillsManifest"],
  },
  {
    id: "find-community-skill",
    request: "Is there something ready-made for reading PDFs?",
    operations: ["searchCommunitySkills"],
  },
  {
    id: "change-profile",
    request: "My name is spelled wrong, it should be Julián.",
    operations: ["setMyProfile"],
  },
  {
    id: "list-spaces",
    request: "Which spaces do I belong to?",
    operations: ["listOrgs"],
  },
  {
    id: "move-agent",
    request: "Move Dobby into my consulting space.",
    operations: ["moveAgent"],
  },
  {
    id: "team-members",
    request: "Who is on the marketing team?",
    operations: ["listAgentTeamMembers"],
  },
];
