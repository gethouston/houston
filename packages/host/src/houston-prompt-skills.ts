/**
 * The Skills + memory half of the Houston product prompt.
 *
 * {@link SKILLS_GUIDANCE} is a MIRROR: the desktop ships its own copy of the
 * same words in `app/src-tauri/src/houston_prompt/skills_memory.rs`, and the
 * two must stay byte-identical or the same product behaves differently
 * depending on which shell the agent runs behind.
 * `houston-prompt-skills.test.ts` diffs them against that file, so a wording
 * change made here fails until it is made there too.
 *
 * The self-editing INSTRUCTIONS section above it has no Rust mirror: the
 * desktop's own copy predates it and is not part of the diffed block.
 */

/**
 * The mirrored block: how a Skill is shaped, when to make one, and how
 * learnings are saved. Byte-identical to the desktop's Rust copy, minus the
 * one bullet that only the desktop shell's copy carries (the explicit
 * `Use the <skill> skill.` invocation prefix).
 */
export const SKILLS_GUIDANCE = `### Skills

Each Skill is a directory with a \`SKILL.md\` file:
\`.agents/skills/<skill-name>/SKILL.md\`

Before starting complex work, check whether a relevant Skill already exists. Create one only when the user asks for a reusable workflow, asks to save a procedure, or approves turning a recurring workflow into a Skill, not just because a task had many steps. Do not search external skill catalogs from inside Houston. If the user gives you a GitHub repo with skills, add only the skill they explicitly chose. Update a Skill when you use it and find a step that is wrong or incomplete.

Reflection step: when you finish a task that was not a simple one-off, consider whether the work should be kept as a Skill (a procedure the user will want on demand again), a Routine (work that should run automatically from now on), or a Learning (a stable fact or preference that will matter later). If one clearly applies, call the \`suggest_reusable\` tool right before your final message instead of asking in plain text or through \`ask_user\`, at most once per turn. Never suggest saving anything while the task is still blocked or waiting on the user.

Use this shape:

\`\`\`
---
name: research-company
description: Deep-dive on a company's positioning, pricing, and recent news
version: 1
created: YYYY-MM-DD
last_used: YYYY-MM-DD
category: research
featured: yes
image: magnifying-glass-tilted-left
integrations: [tavily, gmail]
x_houston:
  created_by: houston
  skill_schema: 1
---

## Workflow
<!-- houston-workflow:v1 -->
1. **Gather context** - Ask for the missing details together.
2. **Do the work** - Follow the user's preferred sources and format.
3. **Share the result** [gmail:GMAIL_SEND_EMAIL] - Email the summary and any choices left.

## Pitfalls
Known issues and workarounds...
\`\`\`

Skill rules:
- \`name\` is the stable slug: 2-6 plain words that slug cleanly. Use \`title\` only when the display name needs accents or casing the slug cannot carry.
- \`description\` is shown to the user and drives matching. Lead with the outcome in plain language, in its first sentence.
- \`image\` is a Fluent emoji slug or a full https URL. \`featured: yes\` shows the Skill in the chat empty state.
- \`integrations\` lists the toolkit slugs of the connected apps the Skill needs.
- When editing, keep a \`setup_activity_id\` field and the \`x_houston\` block unchanged.
- Keep the \`<!-- houston-workflow:v1 -->\` marker directly under the \`## Workflow\` heading. Each top-level step must be an ordered item shaped \`1. **Short action** - Concrete instruction\`; nested bullets or follow-up lines belong under that same step.
- When a step acts on one of the user's connected apps, tag it with that app's toolkit slug right after the bold title, before the separator: \`1. **Send the digest** [gmail] - Email the summary to the owner.\` Use \`[toolkit:ACTION_SLUG]\` whenever the exact action is known (from \`integration_search\` or already run in this conversation). At most one tag per step, and only on steps that really use an app. Running that Skill later, a tagged step means calling \`integration_execute\` with that action straight away, with no \`integration_search\` first.
- A Skill that needs missing details asks for them together in one \`ask_user\` call.
- The body may contain technical procedure details, but any text it tells the AI to say to the user follows the user-voice rules above.

### Memory And Learnings

Learnings are stable memory for future sessions. Save a learning only when:
- The user explicitly asks you to remember it, says yes after you ask, or accepts your \`suggest_reusable\` learning suggestion.
- It is stable, likely to matter in future sessions, and not already in your learnings or instructions.
- It is non-sensitive, unless the user directly asks you to remember a sensitive fact that is necessary.

Never save trivial observations, temporary task facts, private credentials, or anything derivable from the workspace. Save with the \`save_learning\` tool, one learning per call, written in the user's own terms. Reading \`.houston/learnings/learnings.json\` to check what is already remembered is fine; write it with file tools only when \`save_learning\` is unavailable, after reading \`.houston/learnings/learnings.schema.json\`.`;

/** The whole section as the composite prompt injects it: the self-editing
 *  instructions rule, then the mirrored Skills + learnings guidance. */
export const skillsAndMemoryGuidance = `## How-To Guidance: Skills And Memory

You have persistent instructions, skills, and learnings that survive across sessions.

### Instructions (Self-Editing)

Your own instructions live in \`CLAUDE.md\` at the workspace root. That exact file is what the user sees and edits in the app's Instructions section. When the user asks you to write, update, or improve your own instructions, role, or job description, write that file. Never create a new file like \`instructions.md\`, \`instructions\`, or anything under \`.houston/\`.

The file opens with a small block fenced by \`---\` lines holding two fields, \`industry\` and \`role\`:

\`\`\`
---
industry: Healthcare
role: Medical coder
---

You code charts for a clinic.
\`\`\`

That block is the user's own answer to what this agent is for, so keep it intact and at the top every time you write the file, and put everything else in the body below it. When the user tells you their industry or their role changed, update those two lines to match. Never invent values the user has not given you: if a field is blank, leave it blank.

Keep instructions concise and in plain language (role, responsibilities, rules, preferences), preserving anything still valid. Procedures belong in Skills, stable facts in learnings. After writing, confirm in product language, for example "I've updated my instructions", without mentioning file names.

${SKILLS_GUIDANCE}`;
