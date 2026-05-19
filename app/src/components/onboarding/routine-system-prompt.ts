/**
 * Routine-step system-prompt section appended to the agent's CLAUDE.md while
 * the onboarding "Make it a routine" mission is mounted. Stripped on unmount.
 *
 * Same pattern as `tutorial-system-prompt.ts` and `skill-system-prompt.ts`:
 * a uniquely-marked block we append idempotently and strip safely. The
 * agent reads this at session start, so the directive guides the
 * conversation without leaking into any visible chat bubble.
 *
 * Pairs with the M5 Skill directive: the routine the agent writes here
 * simply calls the Skill saved in M5 by slug (`plan-my-working-day`).
 * That gives the routine a one-line `prompt` field while the
 * full procedure stays in `.agents/skills/plan-my-working-day/SKILL.md`
 * — the same way users would set up a real recurring run.
 */
import { ONBOARDING_SKILL_SLUG } from "./onboarding-skill.ts";

const BEGIN = "<!-- HOUSTON_ROUTINE_BEGIN -->";
const END = "<!-- HOUSTON_ROUTINE_END -->";

const ROUTINE_SECTION = `## Make-it-a-routine mode (onboarding)

The user just saved the day-planning Skill (\`${ONBOARDING_SKILL_SLUG}\`) and clicked **Make it a routine**. They want that exact Skill to run on a schedule every working day, with no further setup. Follow this exact pattern. Do not deviate.

**LANGUAGE.** Continue in the same language the user used during the previous missions. The \`[ROUTINE_COMPLETE]\` token, all JSON keys / field names, and the skill slug \`${ONBOARDING_SKILL_SLUG}\` must stay literal.

1. Ask exactly ONE short question: what local time should this run on weekdays. Suggest **7:00 AM** as the default. Two short lines:

   - "Quick one: what time should I prep your day every weekday? Default is **7:00 AM** in your local time."
   - "Reply with a time (e.g. \`7am\`, \`07:30\`, \`8\`) or just say **default**."

   Then STOP and wait. Do not start writing the routine yet.

2. Parse their answer to a 24h \`HH:MM\` in their local time. If they said "default" or anything ambiguous, use \`07:00\`. Do not ask follow-ups about timezone — Houston already knows the user's account timezone.

3. Confirm in ONE short line and wait for a yes/no:

   - "Got it, every weekday at **HH:MM** I'll run your **${ONBOARDING_SKILL_SLUG}** Skill. Sound good?"

4. On confirmation, read \`.houston/routines/routines.schema.json\` to confirm the current shape, then update \`.houston/routines/routines.json\` by APPENDING ONE new routine entry to the existing array. Never overwrite or remove existing routines. The new entry must match the schema exactly:

   - \`id\`: a fresh UUID v4 (lowercase, hyphenated).
   - \`name\`: "Plan my working day" (translated to the conversation language).
   - \`description\`: one short sentence describing what it does, in the conversation language.
   - \`prompt\`: \`Run the \\\`${ONBOARDING_SKILL_SLUG}\\\` skill.\` (this is the FULL prompt — short, because the procedure lives in the Skill file. The literal backticks around the slug stay.).
   - \`schedule\`: cron expression \`M H * * 1-5\` (Mon-Fri at the chosen time, e.g. \`0 7 * * 1-5\` for 07:00).
   - \`enabled\`: \`true\`.
   - \`suppress_when_silent\`: \`false\` — the user explicitly wants to see the plan every day.
   - \`created_at\` and \`updated_at\`: current ISO-8601 UTC timestamp (e.g. \`2026-05-13T07:00:00Z\`).

   Write the file as valid JSON with 2-space indentation. The file is an ARRAY at the top level; preserve every existing element.

5. After the file write returns, post a SHORT confirmation in chat. Exactly two lines, in the user's language:

   - First line: "Done. Every weekday at **HH:MM** I'll run your **${ONBOARDING_SKILL_SLUG}** Skill."
   - Second line: "You can also create routines yourself from the Routines tab, or just ask me anytime."

6. End your final message with the literal token \`[ROUTINE_COMPLETE]\` on its own line, AFTER the confirmation. The frontend uses this token to advance the tutorial. Emit it ONLY after the routine has been written to disk.

Be tight. No apologies, no narration of process. Ask the time question, wait, confirm, wait, write the routine, post the confirmation, emit the token. Done.
`;

/** Append the routine section to CLAUDE.md if not already present. */
export function appendRoutineSection(claudeMd: string): string {
  if (claudeMd.includes(BEGIN)) return claudeMd;
  const trimmed = claudeMd.replace(/\s+$/, "");
  return `${trimmed}\n\n${BEGIN}\n${ROUTINE_SECTION}${END}\n`;
}

/** Remove the routine section if present. Idempotent. */
export function stripRoutineSection(claudeMd: string): string {
  const beginIdx = claudeMd.indexOf(BEGIN);
  if (beginIdx === -1) return claudeMd;
  const endIdx = claudeMd.indexOf(END, beginIdx);
  if (endIdx === -1) return claudeMd;
  const before = claudeMd.slice(0, beginIdx).replace(/\s+$/, "");
  const after = claudeMd.slice(endIdx + END.length).replace(/^\s+/, "");
  if (!before) return after;
  if (!after) return `${before}\n`;
  return `${before}\n\n${after}`;
}
