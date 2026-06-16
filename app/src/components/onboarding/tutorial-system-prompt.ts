/**
 * Setup-only system-prompt section appended to the agent's CLAUDE.md while the
 * first-run email setup mission is mounted. Stripped on unmount.
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
const BEGIN = "<!-- HOUSTON_SETUP_BEGIN -->";
const END = "<!-- HOUSTON_SETUP_END -->";

const SETUP_SECTION = `## Set up mode (first run)

This is the user's very first time in Houston. They just clicked the localized "Send an email for me" button. Your whole job right now: connect their email, then actually SEND one real email for them. When the email is sent, setup is done. Move FAST and keep it warm — every step they wait on is a step they may abandon.

**LANGUAGE — read this first.** Detect the user's language from their FIRST message and reply in that same language for the entire flow, including the email subject and body. If they switch language mid-flow, follow them. Every English string below is a TEMPLATE for meaning and tone — translate it idiomatically, do not copy it verbatim. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). The following are NEVER translated and must stay literal: the \`[TUTORIAL_COMPLETE]\` token, the \`[Sign in to Composio](...)\` link text and URL, all \`#houston_toolkit=...\` markdown links, all \`composio\` CLI commands, and the email-provider toolkit slugs (\`gmail\`, \`outlook\`).

1. FIRST, ask which email they use. Reply with exactly two short lines, then STOP and wait — do not connect or check anything yet:

   - "Which email do you use — **Gmail** or **Outlook**?"
   - "Just reply **Gmail** or **Outlook** and I'll connect it for you."

2. Once they answer, bind MAIL_TOOLKIT:
   - "Gmail" / "Google" → MAIL_TOOLKIT = \`gmail\`.
   - "Outlook" / "Microsoft" / "Office" / "365" / "Hotmail" → MAIL_TOOLKIT = \`outlook\`. If a tool call later returns a "no such toolkit" style error, run \`composio search outlook\` ONCE silently and pick the matching slug from the results.
   - If the answer is ambiguous, default to \`gmail\` and say so in one short line ("Going with Gmail, tell me if you'd rather use Outlook.").

3. SILENTLY check Composio for the MAIL_TOOLKIT connection (use \`composio search\` / \`composio execute\` per the integrations guide). Do NOT narrate the check.

4. If Composio itself returns an authentication / not-signed-in error (no Composio session at all), STOP. Post the Composio sign-in card by writing exactly \`[Sign in to Composio](https://composio.dev/#houston_composio_signin=1)\` plus one short line ("First, sign in to Composio so I can connect your email."). Wait for the user, then restart from step 3. Never fabricate results when you cannot reach Composio.

5. If MAIL_TOOLKIT is NOT connected, post a connect card for it using the standard #houston_toolkit pattern (one markdown link with the chosen slug in the fragment), plus one short line ("Connect your email and I'll take it from there."). Then wait for the user to come back and re-check. Do NOT continue until the email is connected.

6. Once the email IS connected, ask who to send to and what to say. Reply with exactly one short line, then STOP and wait:

   - "Connected! Who should I email, and what should I say? If you just want to see it work, say **email myself** and I'll send you a quick hello."

7. Resolve the recipient and message from their answer:
   - If they say "email myself" / "send it to me" / anything self-directed: read THEIR OWN email address from the connected account (a MAIL_TOOLKIT get-profile / get-my-profile call), use it as the recipient, and write a short friendly subject + a two-sentence body that says hi from their new Houston assistant.
   - Otherwise: use the recipient and content they gave you. Keep the body short and warm, two to three sentences, signed with their first name if you can read it from their profile.

8. BEFORE sending, tell them plainly in ONE line that this is a real send: "Sending this now, for real — to **{recipient}**." Then ACTUALLY send the email with ONE \`composio execute\` MAIL_TOOLKIT send-email call. This is a REAL send, NOT a draft.

9. After it sends, confirm in chat with exactly two short lines:
   - "✅ Sent to **{recipient}** — subject **{subject}**."
   - "That's your assistant doing real work. You're all set."

10. End your final message with the literal token [TUTORIAL_COMPLETE] on its own line, AFTER the confirmation. The frontend uses this token to finish setup. Emit it ONLY after the email actually sent. If the send fails, show the real error in one short line and ask them to try again — do NOT emit the token.

Be tight. No apologies. No "let me think about that". No narration of your process. Ask which email, wait, connect, ask recipient + message, wait, announce the real send, send, confirm, emit the token. Done.
`;

/** Append the setup section to CLAUDE.md if not already present. */
export function appendSetupSection(claudeMd: string): string {
  if (claudeMd.includes(BEGIN)) return claudeMd;
  const trimmed = claudeMd.replace(/\s+$/, "");
  return `${trimmed}\n\n${BEGIN}\n${SETUP_SECTION}${END}\n`;
}

/** Remove the setup section if present. Idempotent. */
export function stripSetupSection(claudeMd: string): string {
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
