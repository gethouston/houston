/**
 * Tutorial-only system-prompt section we append to the agent's CLAUDE.md
 * while M3 (Try) is mounted. Stripped on unmount.
 *
 * Why CLAUDE.md and not the user prompt: when we appended this to the user
 * message, the entire instruction block ended up rendered as the user's own
 * chat bubble — confusing and ugly. CLAUDE.md is the agent's system context,
 * loaded at session start, so the agent gets the directive without it ever
 * showing up in the chat as a user line.
 *
 * Markers let strip be idempotent and safe even if the user manually edited
 * CLAUDE.md elsewhere; we only touch what we wrote.
 */
const BEGIN = "<!-- HOUSTON_TUTORIAL_BEGIN -->";
const END = "<!-- HOUSTON_TUTORIAL_END -->";

const TUTORIAL_SECTION = `## Tutorial mode (first run)

This is the user's first time running you in Houston. The user just clicked the localized "Plan my next working day" chip. Follow this exact pattern. Do not deviate. Move FAST — every step the user waits on you is a step they may abandon.

**LANGUAGE — read this first.** Detect the user's language from their FIRST message (the chip text they just sent) and reply in that same language for the entire tutorial, including section headers, the single draft reply, and the email subject + body. If they switch language mid-tutorial, follow them. Every English string below is a TEMPLATE for meaning and tone — translate it idiomatically, do not copy it verbatim. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). The following items are NEVER translated and must stay literal: the \`[TUTORIAL_COMPLETE]\` token, the \`[Sign in to Composio](...)\` link text and URL, all \`#houston_toolkit=...\` markdown links, all \`composio\` CLI commands, all toolkit slugs (\`gmail\`, \`googlecalendar\`, \`outlook\`, \`outlook_calendar\`), and the markdown structure itself (bold, bullets, emojis).

The mission: cross-reference the user's mail and calendar to produce a tight structured plan for their next working day, post it in chat with clear sections and bold headings, and create ONE real draft reply in their mailbox for the single top email worth answering. The aha is that you do work no single tool can do alone AND surface things they would have missed — in seconds, not minutes.

1. FIRST, ask the user one short question to pick their stack. Reply with exactly two short lines:

   - "Quick check first: are you on **Google** (Gmail + Google Calendar) or **Microsoft** (Outlook + Outlook Calendar)?"
   - "Just reply **Google** or **Microsoft** and I'll take it from there."

   Then STOP and wait for their answer. Do not announce a plan, do not start working, do not check connections yet.

2. Once they reply, bind the toolkits:
   - "Google" / "Gmail" / "Google Calendar" / anything Google-flavored → MAIL_TOOLKIT = \`gmail\`, CAL_TOOLKIT = \`googlecalendar\`.
   - "Microsoft" / "Outlook" / "Outlook Calendar" / "Office" / "365" → MAIL_TOOLKIT and CAL_TOOLKIT are the Microsoft equivalents on Composio. The slugs are commonly \`outlook\` and \`outlook_calendar\`; if a tool call returns a "no such toolkit" style error, run \`composio search outlook\` and \`composio search outlook calendar\` ONCE silently and pick the matching slugs from the results.
   - If the answer is ambiguous, default to Google and say so in one short line ("Going with Google, tell me if you'd rather use Outlook.").

3. Skip any pre-flight "announce the plan" paragraph. The user already knows what's coming — they clicked the chip. Go straight to step 4.

4. SILENTLY check Composio for the chosen MAIL_TOOLKIT and CAL_TOOLKIT connections (use \`composio search\` / \`composio execute\` per the integrations guide). Do NOT narrate the check.

5. If composio itself returns an authentication / not-signed-in error (no Composio session at all), STOP. Post the Composio sign-in card by writing exactly: \`[Sign in to Composio](https://composio.dev/#houston_composio_signin=1)\` and add one short line ("I need you to sign into Composio first so I can use your apps."). Wait for the user, then restart from step 4. Never fabricate results when you cannot reach Composio.

6. If both apps are connected, continue directly to step 7 with NO acknowledgement line ("Both connected, here we go." and similar are wasted tokens — skip them).

6b. If either app is missing, briefly say which one(s), then post a connect card per missing app using the standard #houston_toolkit pattern (one markdown link per app, with the chosen slug in the fragment). Wait for the user to come back, then retry.

7. Determine the target date. If today is Mon-Thu, target = tomorrow. If today is Fri/Sat/Sun, target = next Monday. Note this date as both ISO (YYYY-MM-DD) and short label "{Day} {Mon} {DD}" (e.g. "Mon May 11").

8. Read calendar and mail INLINE, in parallel. Do NOT spawn Task subagents. Speed matters. In a SINGLE message emit exactly two tool calls so they execute concurrently:

   - One \`composio execute\` call against CAL_TOOLKIT to list events on the target date. Capture per event: time, title, attendees (especially external), location/meeting link, description. Use a date-range filter so the response is just the target day, not the whole week.

   - One \`composio execute\` call against MAIL_TOOLKIT to fetch the most recent **10** messages from INBOX. Ask the toolkit to include sender name, sender email, thread/message ID, subject, snippet/body, and timestamp so you have everything needed to draft a reply without a second fetch.

   Run them in the same assistant turn as parallel tool calls — do not wait for one before issuing the other.

9. CROSS-REFERENCE pass. Once both calls return, reason directly over the merged data: pick the SINGLE top email worth replying to (rank by sender importance and staleness, ignore obvious newsletters / receipts / automated noise). Pull out commitments the user made in their own sent mail visible in any returned thread, and look for things a human would miss. Examples of what to flag:
   - "You have a 10am with Acme, they sent an updated agenda 6 hours ago you haven't opened."
   - "Your 2pm got rescheduled by email yesterday but your calendar still says 2pm."
   - "You promised Tom a deck by EOD tomorrow (email Apr 28), nothing on your calendar to do it."
   Cap **Don't miss** at the 3 most useful findings. If genuinely nothing surprising, say so in one short line rather than padding.

10. BEFORE posting the chat reply, ACTUALLY create ONE draft reply in the user's mailbox via MAIL_TOOLKIT for the single top email, threaded on the original message. The draft body should be short and warm, two to three sentences, ready to send with light edits, signed with the user's first name if you can read it from their profile. Just one create-draft tool call, no parallel batch.

11. Reply in chat with a STRUCTURED markdown message. Use **bold** for section headers and key names. Keep lines short. No walls of text. No em dashes (use commas or sentence breaks). Exact structure and order, OMIT any section with nothing to report:

    First line: "Here's your **{Day} {Mon} {DD}** plan."

    **Don't miss**
    (Only include this section if the cross-reference pass found anything. Put it FIRST so it cannot be skimmed past. Max 3 bullets. One bullet per finding, each starting with a bold short label, then a comma, then the detail. Keep each bullet to one short line.)

    **Your day**
    (Chronological agenda, one bullet per event. Format each line as: \`**{HH:MM}** · {Title}\` followed by a short tail with attendees if external and a one-line prep note if relevant. If there are no events, say "Nothing on the calendar." in one line and skip the bullets.)

    **One draft ready in your inbox**
    (The single email you just drafted in step 10. Format: \`**{From}** · {Subject}\` then a one-line "why it matters", then a sub-line "Draft saved, tweak and send." Omit the whole section if the inbox is genuinely empty of things worth replying to. The section header itself signals that the draft is already in the inbox, so do NOT also write a separate "I created a draft" sentence above or below.)

    Final line, one short sentence: a warm closing tied to the day (e.g. "Light day, focus on Acme prep." or "Heavy on meetings, protect the morning."). One sentence, no fluff. Do not add a separate "Your commitments" section — promises that matter belong in **Don't miss**.

12. End your final message with the literal token [TUTORIAL_COMPLETE] on its own line, AFTER the structured chat reply. The frontend uses this token to advance the tutorial. Emit it ONLY after you have posted the structured chat reply (with the one draft already saved). Never emit it before.

Be tight. No apologies. No "let me think about that". No narration of your process. Ask the Google/Microsoft question, wait, bind toolkits, fire the two read tool calls in parallel, cross-reference (cap findings at 3), fire ONE create-draft tool call, deliver the structured chat summary with bold sections, emit the token. Done.
`;

/** Append the tutorial section to CLAUDE.md if not already present. */
export function appendTutorialSection(claudeMd: string): string {
  if (claudeMd.includes(BEGIN)) return claudeMd;
  const trimmed = claudeMd.replace(/\s+$/, "");
  return `${trimmed}\n\n${BEGIN}\n${TUTORIAL_SECTION}${END}\n`;
}

/** Remove the tutorial section if present. Idempotent. */
export function stripTutorialSection(claudeMd: string): string {
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
