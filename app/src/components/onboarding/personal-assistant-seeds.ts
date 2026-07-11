import type { TFunction } from "i18next";

/**
 * Seed content written into a brand-new default Personal Assistant's on-disk
 * tree at creation, so first-run users get real capability instead of an empty
 * shell. Two universal "aha" patterns: a scheduled daily briefing (calendar +
 * inbox) and pre-meeting research/prep.
 *
 * i18n split (mirrors `buildAssistantInstructions`): the SHORT bits a user reads
 * in a Skills/Routines list — the routine `name` and the skill
 * `title`/`description` — flow through `t()` (mirrored across en/es/pt). The
 * LONG-form agent instructions — the routine `prompt` and the SKILL.md `## Steps`
 * procedure — stay English-only; they are model instructions, not UI copy, the
 * same category as `buildAssistantInstructions`'s own English scaffolding. The
 * one twist: those model instructions carry an explicit "write your OUTPUT in
 * <language>" line built from the active locale, so an es/pt user gets an es/pt
 * briefing even though the instructions themselves are English.
 */

// Fixed seed timestamp — creation must be reproducible, so we can't call
// Date.now()/new Date() here (matches legal.json's fixed-timestamp pattern).
const SEED_TIMESTAMP = "2026-01-01T00:00:00Z";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
};

/**
 * The human-readable language name for a locale code (`"es-419"` → `"Spanish"`),
 * used to tell the agent which language to write its user-facing output in.
 * Falls back to English for anything unmapped.
 */
export function outputLanguageName(locale: string): string {
  const base = locale.split("-")[0]?.toLowerCase() ?? "en";
  return LANGUAGE_NAMES[base] ?? "English";
}

/**
 * Daily-briefing routine prompt (English-only scaffolding sent to the LLM, with
 * the user's OUTPUT language injected). Written as a complete, self-contained
 * instruction the agent follows when the routine fires.
 *
 * Routine fires run in Autopilot (`mode: "auto"`), which suppresses the
 * ask_user / connect cards — so the prompt can never lean on "connect your
 * calendar" as an interactive step. Instead it detects what is actually
 * connected and builds the briefing from that, staying silent (ROUTINE_OK) when
 * nothing is connected rather than opening with an apology. Paired with
 * `suppress_when_silent: true` so a nothing-connected morning is silent, not
 * daily spam, while a connected user always gets real content.
 */
function dailyBriefingPrompt(languageName: string): string {
  return `Put together my morning briefing for today. Keep it short and skimmable — I read this before I start my day.

Write the whole briefing in ${languageName}. That is the language I read, so every heading and every line goes in ${languageName}, not English.

Before you write anything, check what you can actually reach right now:
- Is a calendar connected (Google Calendar / Outlook Calendar)?
- Is an inbox connected (Gmail / Outlook)?

Build the briefing only from what IS connected. Never lead with what is missing, and never turn this into an apology for something you could not do.

1. If a calendar is connected, read today's events. List each meeting with its time, title, and who is attending. Flag anything back-to-back or without a clear agenda.
2. If an inbox is connected, scan for unread or recent messages from the last day. Pull out only what actually needs me: direct questions, things waiting on my reply, deadlines, and anything time-sensitive. Skip newsletters, receipts, and automated noise.
3. Write the briefing as a couple of short sections with natural headings in ${languageName} — for example a "today's schedule" section (a tight list of meetings) and a "needs your attention" section (a few bullets, most important first). Those English names are only illustrations; use real ${languageName} headings. If an email ties to a meeting today, say so.
4. If exactly one of the two is connected, build the briefing from that one, then add at most ONE short, low-key line inviting me to connect the other (for example, in ${languageName}, "Connect your calendar and I can fold your schedule in here too"). One line, at the end, never at the top, never a complaint.
5. If NEITHER a calendar NOR an inbox is connected, there is nothing to brief and no way to build one. Do not write a briefing and do not apologize — end your response with exactly "ROUTINE_OK" on its own line so this run stays silent.

Do not send anything or change anything in my connected apps. This is a read-only summary for me.`;
}

/**
 * meeting-prep SKILL.md body (English-only markdown). The frontmatter's short
 * user-facing bits (`title`, `description`) are interpolated from `t()`; the
 * final brief handed to the user is written in the user's `languageName`.
 */
function meetingPrepSkill(t: TFunction<"setup">, languageName: string): string {
  return `---
name: meeting-prep
title: ${t("tutorial.seeds.meetingPrep.name")}
description: "${t("tutorial.seeds.meetingPrep.description")}"
version: 1
category: Meetings
featured: yes
image: spiral-calendar
integrations: [gmail, outlook, googlecalendar, outlook_calendar]
---


# Meeting Prep

## When to use

- Explicit: "prep me for my next meeting", "what do I need to know before this call", "brief me before my 3pm", "who am I meeting with next".
- Implicit: proactively, shortly before a calendar event that has attendees you do not recognize or a company you have not met before.
- Read-only research. I never reply to anyone or change the invite; I just gather context and hand it to you.

## Steps

1. **Find the next meeting.** Look at the connected calendar (Google Calendar / Outlook Calendar) and pick the next upcoming event with other attendees. If the user named a specific meeting, use that one instead. If nothing is coming up, say so and stop.
2. **Identify the attendees.** Read the invite for the attendee list, their email addresses, and the domains (which tell you the company). Note the organizer separately. If it is an internal-only meeting, say so — the prep is lighter.
3. **Search the inbox for context.** Query Gmail / Outlook for recent threads with those people and with their company domain. Pull out what you last discussed, any open questions, commitments either side made, and anything still waiting on a reply. Quote the most recent relevant message so the user can place it.
4. **Do a light web check.** If there is a real person or company name to search, run a quick web lookup for recent, relevant public context (what the company does, recent news, the person's role). Be honest about the limits: Houston has no CRM or sales-intelligence tool, so this is research from what is already in the inbox plus a quick public web check — not enriched contact data.
5. **Write a short brief and hand it over before the meeting.** Structure: who is on the call (name, role, company), what you last discussed with them, and anything time-sensitive to raise or watch for. Write the brief in ${languageName} — that is the language the user reads. Keep it to a few lines the user can read in under a minute. Deliver it before the meeting starts, not after. Do not send anything to the attendees.

## Never invent

Every claim ties to something you actually found — an email thread, the invite, or a web result. If the inbox search returned nothing and there is no public info, say "no prior context found" rather than guessing. If a tool errored, say so and hand over what you have.`;
}

/**
 * Build the flat seed map written into the new default agent's `.houston` /
 * `.agents` tree. Keys are repo-root-relative paths inside the agent folder;
 * values are the file contents. `locale` (the active i18n language, e.g.
 * `"es"`) selects the language the seeded routine/skill write their user-facing
 * output in — passed explicitly so the builder stays pure and testable.
 */
export function buildPersonalAssistantSeeds(
  t: TFunction<"setup">,
  locale: string,
): Record<string, string> {
  const languageName = outputLanguageName(locale);
  const routines = [
    {
      id: "daily-briefing",
      name: t("tutorial.seeds.dailyBriefing.name"),
      prompt: dailyBriefingPrompt(languageName),
      schedule: "0 7 * * 1-5",
      enabled: true,
      // A nothing-connected morning ends in ROUTINE_OK and stays silent, so
      // first-run users are never spammed with an empty (or apologetic)
      // briefing before they connect anything.
      suppress_when_silent: true,
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
    },
  ];

  return {
    ".houston/routines/routines.json": JSON.stringify(routines, null, 2),
    ".agents/skills/meeting-prep/SKILL.md": meetingPrepSkill(t, languageName),
  };
}
