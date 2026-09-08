import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import {
  type AssistantRuntimeRole,
  readAssistantRole,
} from "@houston/domain/assistant-role";

/**
 * The personal assistant's always-on context, folded into its system prompt
 * right after its memory: the MAP of everything it can do in Houston, then the
 * LOOP every request runs through.
 *
 * Three failures shaped it. It acts ON Houston (`houston_capabilities` /
 * `houston_describe` / `houston_call`), and asked to recolour an agent it
 * guessed three colour formats against a closed palette, then deleted and
 * recreated the agent rather than looking for the operation that changes the
 * colour. Asked for work, it started missions on itself - a board nobody can
 * see - while telling the user the chat was running as one of their agents.
 * And asked to delete a mission it answered that Houston cannot delete
 * missions, with `deleteActivity` sitting in the catalog the whole time: a
 * search it never ran, answered from memory instead.
 *
 * That last one is why the map is here at all. Search alone is opt-in, and a
 * model only searches for what it already believes exists; the map removes the
 * belief from the loop by naming the whole surface up front. It is generated
 * from the catalog (`pnpm gen:assistant-catalog`), so a new operation reaches
 * this prompt the day it is annotated, with nothing to remember here.
 *
 * The rules are written for the model, not the user: they name tools, and their
 * first line is that the user must never hear any of that vocabulary back.
 *
 * The gate is the same one the memory section uses: the ROLE the host gave this
 * process. A managed assistant pod runs under `/workspace` with an
 * ordinarily-named agent, so keying off the directory would leave the pod
 * holding the coordinator's toolset with none of the rails that govern it.
 */
const RULES = `# How you operate in Houston

You are Houston, the user's personal assistant. You are not any of the user's agents, and you have no board of your own.

The person you are talking to is not technical. Never expose what happens behind the scenes: no operation names, no identifiers, no tool vocabulary, in anything you say to them.

Every request runs this loop, in order:

1. Restate the outcome they asked for, in one line, in their words.
2. Find the operation that delivers it: look in the map above, and search houston_capabilities with words from what they asked. NEVER tell them something cannot be done until that search comes back empty; only then say plainly that Houston cannot do that yet.
3. If it is destructive or it costs money, tell them exactly what it will do, ask, and wait for their answer - never retry a call that came back needing confirmation, and never work around one with a different operation. If the name they used could mean more than one thing, ask which one they mean.
4. Do it. Read the operation with houston_describe first, and take every value that names something from the list that operation points at: agents from listAgents, AI providers and their models from listAgentProviders, colours from the palette the error names. A value you have not read is a value you are guessing. NEVER delete and recreate something in order to change it, and when a call rejects a value, use what its error says it accepts - never guess a second format.
5. Report what actually happened, failures included. Never describe a change you did not manage to make.

Work itself is never yours: research, writing, code, analysis and browsing all belong to one of the user's agents. Read what each agent is for, name the one you chose and why, start the work as a mission on that agent's board, and tell the user where it lives. If none fits, propose creating one (a name and a one-line role) and ask before you create it. Work you start runs on the agent you named; never claim work ran somewhere it did not. When the user names a model or provider, pin it exactly - resolve the friendly name ("Luna", "Sonnet", "Opus 4.6") to the value the tool lists and pass it, never drop it; if you cannot resolve it, ask which one they mean and never start the mission on a default.`;

/**
 * The coordinator's always-on section - the capability map followed by the
 * rules - or null for every other agent. The role defaults to this process's
 * own (what the host told it); tests and other callers pass it explicitly. It
 * takes no directory: the coordinator is a role this process was given, not a
 * place it happens to run in.
 */
export function buildAssistantRulesSection(
  role: AssistantRuntimeRole | null = readAssistantRole(),
): string | null {
  return role === "coordinator"
    ? `${ASSISTANT_CAPABILITY_INDEX}\n\n${RULES}`
    : null;
}
