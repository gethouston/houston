/**
 * Setup-only system-prompt section appended to the agent's CLAUDE.md while the
 * first-run email setup mission hands off to the real agent. Stripped on
 * unmount.
 *
 * Why CLAUDE.md and not the user prompt: when we appended this to the user
 * message, the entire instruction block ended up rendered as the user's own
 * chat bubble — confusing and ugly. CLAUDE.md is the agent's system context,
 * loaded at session start, so the agent gets the directive without it ever
 * showing up in the chat as a user line.
 *
 * The flow now collects the email provider, recipient, and message up front via
 * a guided (faked) wizard, so the directive is DYNAMIC: it tells the agent the
 * choices already made and asks it only to (1) connect the email IN the chat,
 * so the user sees their agent do it, and (2) send one real email. Markers let
 * strip be idempotent and safe even if the user edited CLAUDE.md elsewhere.
 */
const BEGIN = "<!-- HOUSTON_SETUP_BEGIN -->";
const END = "<!-- HOUSTON_SETUP_END -->";

export interface SetupEmailChoices {
  /** Toolkit slug, e.g. "gmail" / "outlook" / a slug the user typed. */
  toolkit: string;
  /** Human label for the toolkit, e.g. "Gmail". */
  toolkitLabel: string;
  /** True when the user chose "send it to myself (just to test)". */
  toMyself: boolean;
  /** Recipient address when not sending to self. */
  recipientEmail?: string;
  /** What the user wants the email to say (optional; may be blank). */
  message?: string;
}

const LANGUAGE_NOTE = `**LANGUAGE — read this first.** Detect the user's language from the chat so far and reply in that same language for the entire flow, including the email subject and body. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). Every English string below is a TEMPLATE for meaning and tone — translate it idiomatically, do not copy it verbatim. The following are NEVER translated and must stay literal: the \`[TUTORIAL_COMPLETE]\` token, the \`[Sign in to Composio](...)\` link text and URL, all \`#houston_toolkit=...\` markdown links, all \`composio\` CLI commands, and the toolkit slugs (\`gmail\`, \`outlook\`).`;

/** Build the dynamic setup directive from the wizard's collected choices. */
export function buildSetupSection(choices: SetupEmailChoices): string {
  const { toolkit, toolkitLabel, toMyself, recipientEmail, message } = choices;
  const recipientLine = toMyself
    ? `the user themselves — read their own address from the connected ${toolkitLabel} account profile (a get-my-profile call)`
    : `${recipientEmail}`;
  const messageLine = message?.trim()
    ? `"${message.trim()}"`
    : "a short, warm two-sentence hello from their new Houston agent";

  return `## Set up mode (first run)

The user just walked a quick guided setup, ALREADY connected their email (${toolkitLabel}), and chose everything below. Do NOT ask anything, and do NOT post a connect card — ${toolkitLabel} is already connected. Your only job: send ONE real email right now, then confirm. Move fast, stay warm.

${LANGUAGE_NOTE}

CHOICES (already made — never re-ask):
- Email provider: ${toolkitLabel} (toolkit slug \`${toolkit}\`) — already connected.
- Recipient: ${recipientLine}
- Message: ${messageLine}

Do exactly this:

1. SEND the email immediately with ONE \`composio execute\` ${toolkit} send-email call. This is a REAL send, not a draft. Pass ONLY \`recipient_email\`, \`subject\`, and \`body\`. Do NOT include \`attachment\` or any other file field — an empty attachment path makes the send fail with \`ENOENT: no such file or directory\`. Resolve the recipient and message from the CHOICES above; if the message is the default hello, write a short friendly subject + a two-sentence body signed with their first name if you can read it from their profile.

2. Tell them in ONE line that this is a real send ("Sending this now, for real — to **{recipient}**."), then after it sends confirm in exactly two short lines:
   - "✅ Sent to **{recipient}**."
   - "That's your agent doing real work. You're all set."
   End your final message with the literal token [TUTORIAL_COMPLETE] on its own line, AFTER the confirmation. Emit it ONLY after a successful real send. If the send fails (for example the email is not actually connected), show the real error in one short line and ask them to try again — do NOT emit the token, and do NOT post a connect card.

Be tight. No apologies, no narration of your process. Send, confirm, token. Done.`;
}

/** Append the dynamic setup section to CLAUDE.md if not already present. */
export function appendSetupSection(
  claudeMd: string,
  choices: SetupEmailChoices,
): string {
  if (claudeMd.includes(BEGIN)) return claudeMd;
  const trimmed = claudeMd.replace(/\s+$/, "");
  return `${trimmed}\n\n${BEGIN}\n${buildSetupSection(choices)}\n${END}\n`;
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
