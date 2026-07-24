/**
 * The Claude-facing kickoffs for a custom skill's setup chat (HOU-791 — the
 * Skills surface gets the Automations-tab experience: build and change a
 * skill by talking to the agent, never by hand-editing markdown). English on
 * purpose (all prompts are); the agent mirrors the user's language when it
 * answers. They ride the auto-continue marker (`lib/auto-continue-message.ts`):
 * the user never typed anything, so the transcript hides the bubble and the
 * conversation opens with the agent's greeting.
 *
 * The product prompt's "Skills" how-to section (the SKILL.md shape, naming
 * rules, user-voice rules) does the heavy lifting; these kickoffs run the
 * interview and pin the chat <-> skill link (`skill-chat-setup.ts`).
 */

import { encodeAutoContinueMessage } from "./auto-continue-message.ts";

/**
 * The create kickoff. Takes the setup chat's own activity id so the agent can
 * link the new skill back to it via the frontmatter `setup_activity_id`.
 */
export function skillSetupPrompt(activityId: string): string {
  return `Houston sent this message automatically: the user clicked "Create with AI" on the Skills page. This chat is where you build their new skill, and it stays attached to the skill forever — the user can come back to it any time to change how the skill works. The user has not said anything yet and is waiting for you to start.

Your job in this conversation: guide the user through creating ONE new skill, then create it. A skill is a reusable step-by-step procedure you follow whenever the user asks for that kind of work — writing their weekly update in their voice, researching a company the way they like, preparing an invoice their way.

Start RIGHT NOW, in this same turn, with a SINGLE ask_user call — do not write anything before it, and do not spend a separate turn on a greeting first (every turn costs the user real money, so get straight to the point). Fold a brief, friendly framing INTO the question itself (match the user's language): mention you'll help them build this and they can always come back to this same chat to change it later, then ask what the skill should help them with. Offer 3 or 4 concrete example options based on what you help this user with (for example "Write my weekly investor update", "Research a company before a call", "Turn meeting notes into action items"), and they can always describe their own idea instead. A turn that ends without an ask_user call is a mistake, until the skill is created.

Interview rules:
- BATCH the questions: put everything you need into as FEW ask_user calls as possible — ideally exactly ONE call carrying up to 3 questions, so the user sees the whole picture at once instead of a drip of one question per turn. Only make a follow-up ask_user call if an answer genuinely opens something you could not have asked up front.
- Offer answer options for every question that allows it.
- Keep every message to a couple of short sentences, friendly and non-technical. Never mention files, markdown, JSON, schemas, tools, or field names.
- If an answer already covers another question, drop that question; prefer sensible defaults over extra rounds.

What you need to learn (batch these into that first call wherever possible):
1. What the skill should do, step by step at whatever level of detail the user can give — plus anything that makes the result THEIRS (tone, format, examples, rules).
2. When they'd reach for it, in their own words (this becomes how you recognize they want it later).
3. Which of their connected apps it should use, if the work touches email, calendar, documents, or other apps.

When you have everything, summarize the skill in a few plain lines (what it does, and when you'll use it) and ask for approval with ask_user (Yes / No). Only create it after a Yes. Create it following your Skills guidance — propose a short plain name yourself — and include a frontmatter field "setup_activity_id" set to exactly "${activityId}"; that keeps this chat attached to the skill. Never mention this field or any other technical detail to the user. Then confirm it is ready, mention they can run it any time just by asking, and remind them they can change it right here, in this same chat, any time.`;
}

/**
 * The kickoff for an existing skill's first-ever chat (installed from the
 * store or GitHub, created from scratch, or from before setup chats existed).
 * One calm greeting, no interview — it already exists.
 */
export function skillModifyPrompt(skill: {
  slug: string;
  displayName: string;
}): string {
  return `Houston sent this message automatically: the user opened their existing skill "${skill.displayName}" on the Skills page. This chat stays attached to this skill from now on. The user has not said anything yet.

Right now, write exactly one short, friendly line (match the user's language) saying you can change this skill for them any time — what it does, the steps it follows, its tone, anything — they just have to tell you. Do not ask a question, do not call ask_user, and end your turn after that single line.

Later in this conversation, when the user asks for changes: update THIS skill — the one stored under ".agents/skills/${skill.slug}/" — in place. Never create a second skill for a change request, and never rename its folder unless the user explicitly asks for a new name. Change only what the user asked about and keep everything else exactly as it already is, including the frontmatter "setup_activity_id" field if present (it keeps this chat attached to the skill). Ask for approval with ask_user (Yes / No) before saving a change, keep every message short and non-technical, and never mention files, markdown, schemas, ids, or field names to the user.`;
}

/**
 * The full first-message body for a new-skill chat: marker (hides the bubble)
 * + create kickoff (what the model acts on).
 */
export function encodeSkillSetupMessage(activityId: string): string {
  return encodeAutoContinueMessage(skillSetupPrompt(activityId));
}

/** The full first-message body for an existing skill's first-ever chat. */
export function encodeSkillModifyMessage(skill: {
  slug: string;
  displayName: string;
}): string {
  return encodeAutoContinueMessage(skillModifyPrompt(skill));
}
