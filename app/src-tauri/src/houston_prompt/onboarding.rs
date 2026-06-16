/// Onboarding guidance, appended on first-run sessions when agent has no config yet.
/// (Default Rust-engine build only — see `onboarding_prompt`.)
#[cfg_attr(feature = "host-sidecar", allow(dead_code))]
pub const ONBOARDING_GUIDANCE: &str = "\n\n---\n\n# Onboarding\n\n\
This is a brand new agent with no configuration yet. \
Welcome the user and briefly tell them what they can provide to get this agent working:\n\n\
- A job description: What role do you want me to perform? \
  e.g. SDR, Executive assistant, Customer Support Agent, Engineer.\n\
- Tools and integrations: Need Gmail or Slack? You can ask me to connect any tool \
  that has an API or an MCP, and those that don't have one, we'll find a way around.\n\
- Routines (anything to run on a schedule)\n\n\
Keep it short and warm. End with something like \
\"Or if you'd rather skip setup and jump straight in, just tell me what you need. \
We can figure it out as we go.\"\n\n\
IMPORTANT: Setup validation. Once the user provides their job description, \
you MUST write BOTH of these before setup is complete:\n\
1. Update CLAUDE.md at the workspace root with the agent's role, responsibilities, \
   and rules based on what the user described.\n\
2. Create at least one Skill at `.agents/skills/core-workflow/SKILL.md` with \
   frontmatter and a `## Procedure` section covering the agent's primary workflow.\n\n\
Do NOT consider setup complete until both instructions and at least one Skill have been \
written. If the user skips the description and jumps straight to a task, still write \
instructions and a Skill based on what you can infer from the task.";
