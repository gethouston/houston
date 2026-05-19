/**
 * Static template for the SKILL.md the onboarding writes when the user
 * clicks "Save this as a Skill" in M5.
 *
 * The previous version of this module fed a CLAUDE.md directive to the
 * agent so the agent itself would compose and write the skill. That was
 * the second-slowest mission (~20-30s of pure LLM generation for content
 * we already know). We moved the write to the app: this module exports
 * the slug + a deterministic file-builder, and the mission calls
 * `tauriAgent.writeFile` directly. Zero LLM, ~1s.
 *
 * The `name` slug `plan-my-working-day` stays FIXED so the routine
 * directive (M6) can reference it without inspecting the filesystem.
 * Both files keep the slug in lockstep — changing it here means
 * changing it in `routine-system-prompt.ts` too.
 *
 * The frontmatter shape matches `engine/houston-skills/src/format.rs ::
 * serialize` so the engine's parser and the rest of the app see the
 * skill the same way they would if `create_skill` had been called.
 */

/** Slug both the skill file and the routine prompt reference. */
export const ONBOARDING_SKILL_SLUG = "plan-my-working-day";

/** Procedure body inside SKILL.md. English on purpose — the agent reasons
 *  fine in any language, and the `LANGUAGE` line tells it to match the
 *  user's language at runtime. Keeping this English avoids per-locale
 *  drift and matches the format the bundled store skills use.
 */
const PROCEDURE_BODY = `## Procedure

You are running the user's "plan my working day" workflow. Be tight. No narration of your process. Match the user's language for the chat reply.

1. Pick the target working day. If today is Mon-Thu, target = tomorrow. If today is Fri/Sat/Sun, target = next Monday.

2. Read calendar and mail INLINE, in PARALLEL. In a SINGLE assistant turn emit two \`composio execute\` calls so they run concurrently:
   - One against the calendar toolkit listing events on the target date. Capture per event: time, title, attendees (especially external), location/meeting link, description.
   - One against the mail toolkit fetching the 10 most recent INBOX messages with sender name, sender email, thread/message ID, subject, snippet/body, and timestamp.

3. Cross-reference. Pick the single top email worth replying to (rank by sender importance and staleness, ignore newsletters / receipts / automated noise). Pull out commitments the user made in their own recent sent mail visible in the returned threads. Look for things a human would miss (an unopened agenda for a meeting today, a calendar event that conflicts with an email reschedule, a deck promised by EOD with no time blocked, an unconfirmed RSVP).

4. BEFORE posting the chat reply, ACTUALLY create ONE draft reply in the user's mailbox for the single top email, threaded on the original message. The draft body should be a short, warm, on-tone reply, two to three sentences, ready to send with light edits, signed with the user's first name if you can read it from their profile.

5. Post a STRUCTURED markdown reply in chat. Use **bold** for section headers and key names. Keep lines short. No walls of text. No em dashes (use commas or sentence breaks). Structure and order, OMIT any section with nothing to report:
   - First line: \`Here's your **{Day} {Mon} {DD}** plan.\`
   - **Don't miss** (cross-reference findings, FIRST so it cannot be skimmed past, max 3 bullets, each one starting with a bold short label then a comma then the detail).
   - **Your day** (chronological agenda, \`**{HH:MM}** · {Title}\` plus a short tail; if no events, "Nothing on the calendar." in one line and skip the bullets).
   - **One draft ready in your inbox** (the single email you just drafted; format: \`**{From}** · {Subject}\` then a one-line "why it matters" then a sub-line "Draft saved, tweak and send.").
   - Final line: one short, warm closing tied to the day.

End the turn after the structured reply.
`;

interface BuildOnboardingSkillFileOptions {
  /**
   * Localized one-line description for the frontmatter, shown on skill
   * cards in the picker and chat empty state.
   */
  description: string;
  /**
   * Mail + calendar toolkit slugs in `[mail, calendar]` order. Drives
   * the frontmatter `integrations` list AND the small logo row on every
   * card that renders this skill.
   */
  integrations: [string, string];
  /** ISO `YYYY-MM-DD` for `created` and `last_used`. */
  today: string;
}

/**
 * Returns the full SKILL.md content (frontmatter + body) for the
 * onboarding skill. Matches the engine's serializer field-by-field so
 * the parser round-trips it cleanly.
 */
export function buildOnboardingSkillFile(
  opts: BuildOnboardingSkillFileOptions,
): string {
  const [mail, calendar] = opts.integrations;
  const lines = [
    "---",
    `name: ${ONBOARDING_SKILL_SLUG}`,
    `description: ${opts.description}`,
    "version: 1",
    "tags: []",
    `created: ${opts.today}`,
    `last_used: ${opts.today}`,
    "category: planning",
    "featured: yes",
    `integrations: [${mail}, ${calendar}]`,
    "image: spiral-calendar",
    "---",
    "",
    PROCEDURE_BODY,
  ];
  // Trailing newline keeps `git diff` happy and matches the engine
  // serializer's output.
  return `${lines.join("\n")}\n`;
}

/**
 * Pick the right [mail, calendar] toolkit pair from the user's connected
 * Composio toolkits. We prefer Google when both stacks are connected
 * (the day-plan tutorial defaults to Google when the user is ambiguous).
 * Falls back to Google if neither pair is fully connected — better to
 * declare integrations the agent already authed than to silently drop
 * the field.
 */
export function pickOnboardingIntegrations(
  connected: ReadonlySet<string>,
): [string, string] {
  if (connected.has("gmail") && connected.has("googlecalendar")) {
    return ["gmail", "googlecalendar"];
  }
  if (connected.has("outlook") && connected.has("outlook_calendar")) {
    return ["outlook", "outlook_calendar"];
  }
  return ["gmail", "googlecalendar"];
}
