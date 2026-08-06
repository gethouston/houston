import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

/**
 * The agent's tools for the OPEN SKILLS DIRECTORY (skills.sh): find a skill for
 * a task, and install the one the user picks (PRODUCT-1238).
 *
 * WHY they exist: users ask Houston "is there a skill for X?" / "how do I do
 * X?", and until now the only answer was to send them to the Skills page to
 * browse a marketplace themselves. Vercel's popular `find-skills` skill solves
 * this for coding agents, but its procedure is entirely CLI (`npx skills find`,
 * `npx skills add`) — pi ships no tool CLIs, `npx` installs into `~/.claude`
 * rather than the `.agents/skills/` tree pi loads, and Houston's product prompt
 * forbids naming a CLI to a non-technical user. So the capability is native
 * here instead of installed per agent: every agent has it, on every backend,
 * with no manifest entry and nothing to switch on.
 *
 * Same trust posture as the other host-proxying tools: they hold no secret and
 * carry only the per-sandbox HMAC token, and the host resolves that token to
 * the one agent an install may land in.
 */

export const FIND_SKILLS_TOOL_NAME = "find_skills";
export const INSTALL_SKILL_TOOL_NAME = "install_skill";

/** Both directory tools, in the order they're offered to the model. */
export const SKILL_DIRECTORY_TOOL_NAMES: readonly string[] = [
  FIND_SKILLS_TOOL_NAME,
  INSTALL_SKILL_TOOL_NAME,
];

const FindSkillsParams = Type.Object({
  query: Type.String({
    description:
      "What the user is trying to do, in a few plain keywords (e.g. 'review a contract', 'competitor research', 'linkedin outreach'). Not a full sentence.",
  }),
});
type FindSkillsParams = Static<typeof FindSkillsParams>;

const InstallSkillParams = Type.Object({
  source: Type.String({
    description:
      "The skill's `source` exactly as find_skills returned it (e.g. 'vercel-labs/agent-skills').",
  }),
  skillId: Type.String({
    description:
      "The skill's `skillId` exactly as find_skills returned it. Never invent one — only install something find_skills actually returned.",
  }),
});
type InstallSkillParams = Static<typeof InstallSkillParams>;

export interface SkillDirectoryToolOptions {
  baseUrl: string;
  /** The per-sandbox HMAC token (HOUSTON_SANDBOX_TOKEN). */
  sandboxToken: string;
}

interface FoundSkill {
  skillId: string;
  source: string;
  name: string;
  installs: number;
  description?: string;
}

interface InstalledSkill {
  slug: string;
  path: string;
}

/** POST to a `/sandbox/skills/*` route, relaying the host's reason on failure. */
async function post<T>(
  opts: SkillDirectoryToolOptions,
  route: string,
  body: unknown,
  signal: AbortSignal | undefined,
  toolName: string,
): Promise<T> {
  const base = opts.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/sandbox/skills/${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.sandboxToken}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The host's error bodies are already agent-actionable (rate-limited
    // directory, skill not found, not available on this install) — relay them
    // so the agent explains the real reason instead of guessing.
    throw new Error(
      `${toolName} failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }
  return (await res.json()) as T;
}

export function makeFindSkillsTool(opts: SkillDirectoryToolOptions) {
  return defineTool({
    name: FIND_SKILLS_TOOL_NAME,
    label: "Find a skill",
    description:
      "Search the open directory of ready-made skills for one that fits a task. Use it whenever the user asks what skill they should use, whether a skill exists for something, how to do a task you have no skill for, or asks you to take on a capability you don't have yet. Also use it before building a multi-step procedure from scratch - someone has probably published one. Returns candidates with their descriptions and install counts. Prefer widely-installed skills from reputable sources, present the best one or two in plain words, and ask the user before installing anything.",
    promptSnippet: "Find a ready-made skill",
    parameters: FindSkillsParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: FindSkillsParams,
      signal: AbortSignal | undefined,
    ) {
      const { skills } = await post<{ skills: FoundSkill[] }>(
        opts,
        "search",
        { query: params.query },
        signal,
        FIND_SKILLS_TOOL_NAME,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: skills.length
              ? `${JSON.stringify(skills)}\n\nPick the best fit on description and install count. Describe it to the user in plain words and ask whether to add it, then call install_skill with that skill's exact source and skillId.`
              : "No published skill matches that. Tell the user plainly, and offer to do the task directly or save your own steps as a Skill afterwards.",
          },
        ],
        details: { count: skills.length },
      };
    },
  });
}

export function makeInstallSkillTool(opts: SkillDirectoryToolOptions) {
  return defineTool({
    name: INSTALL_SKILL_TOOL_NAME,
    label: "Add a skill",
    description:
      "Add a skill found by find_skills to this agent. Only call it after the user has agreed to add that specific skill - never install one they did not ask for. Installing again is harmless if it is already there. On success, confirm in plain words that you can now do it, and never mention files, paths, or repositories.",
    promptSnippet: "Add a skill",
    parameters: InstallSkillParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: InstallSkillParams,
      signal: AbortSignal | undefined,
    ) {
      const installed = await post<InstalledSkill>(
        opts,
        "install",
        { source: params.source, skillId: params.skillId },
        signal,
        INSTALL_SKILL_TOOL_NAME,
      );
      return {
        content: [
          {
            type: "text" as const,
            // The session's skill index was built at session start, so a skill
            // installed mid-turn is NOT in it. Hand back the path so the agent
            // can Read the procedure and run it immediately in this same turn.
            text: `Added. The user's skills list now includes it. It is not yet in this session's skill index, so if you are running it right now, read ${installed.path} first and follow it.`,
          },
        ],
        details: installed,
      };
    },
  });
}

/** Both directory tools, built together (they share one host + token). */
export function makeSkillDirectoryTools(opts: SkillDirectoryToolOptions) {
  return [makeFindSkillsTool(opts), makeInstallSkillTool(opts)];
}
