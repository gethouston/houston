import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodeRoutineIntakeHandoffMessage,
  routineIntakeHandoffPrompt,
} from "./routine-chat-handoff.ts";

const ACTIVITY = "act_123";
const PROVIDERS = [{ id: "anthropic", name: "Anthropic" }];

const scheduleWake = {
  kind: "schedule",
  cron: "0 9 * * *",
  timezone: "America/Lima",
  summary: "Every day at 9:00 AM",
};

const triggerWake = {
  kind: "trigger",
  toolkit: "gmail",
  toolkitName: "Gmail",
  connectedAccountId: "ca_789",
  events: [
    {
      slug: "GMAIL_NEW_EMAIL",
      name: "New email",
      description: "A new email arrives in the mailbox",
      configSchema: {
        type: "object",
        properties: { label: { type: "string" } },
      },
    },
    {
      slug: "GMAIL_NEW_LABELED_EMAIL",
      name: "New labeled email",
      configSchema: {
        type: "object",
        properties: { labelId: { type: "string" } },
      },
    },
  ],
};

const webhookWake = { kind: "webhook" };

const forWake = (wake) =>
  routineIntakeHandoffPrompt(ACTIVITY, PROVIDERS, {
    intent: null,
    wake,
    scheduleHint: null,
  });

const forHint = (scheduleHint) =>
  routineIntakeHandoffPrompt(ACTIVITY, PROVIDERS, {
    intent: null,
    wake: null,
    scheduleHint,
  });

test("stamps the setup activity id verbatim (schedule)", () => {
  const p = forWake(scheduleWake);
  assert.match(p, /"setup_activity_id" field to exactly "act_123"/);
});

test("stamps the setup activity id verbatim (trigger)", () => {
  const p = forWake(triggerWake);
  assert.match(p, /"setup_activity_id" field to exactly "act_123"/);
});

test("schedule: carries the exact cron + timezone and the human summary", () => {
  const p = forWake(scheduleWake);
  assert.match(p, /`0 9 \* \* \*`/);
  assert.match(p, /`America\/Lima`/);
  assert.match(p, /Every day at 9:00 AM/);
  assert.match(p, /ONE schedule and no app-event trigger/);
});

test("schedule: forbids re-asking the wake", () => {
  const p = forWake(scheduleWake);
  assert.match(p, /Do NOT ask when it should happen/);
  assert.doesNotMatch(p, /which connected app it lives in/);
});

test("schedule: first ask offers recurring example options", () => {
  const p = forWake(scheduleWake);
  assert.match(p, /What the routine should do. This is your FIRST question/);
  assert.match(p, /Send me a morning summary of my day/);
});

test("trigger: carries the app toolkit, account verbatim, and embeds the catalog", () => {
  const p = forWake(triggerWake);
  assert.match(p, /app event in `gmail`/);
  assert.match(p, /connected_account_id exactly as `ca_789`/);
  assert.match(p, /ONE app-event trigger and no schedule/);
  assert.match(p, /<event_catalog/);
  assert.match(p, /GMAIL_NEW_EMAIL/);
  assert.match(p, /GMAIL_NEW_LABELED_EMAIL/);
  assert.match(p, /"configSchema"/);
});

test("trigger: instructs slug fidelity (choose from the catalog, never invent)", () => {
  const p = forWake(triggerWake);
  assert.match(p, /copying EXACTLY one `slug` from the internal catalog/);
  assert.match(p, /NEVER invent, guess, or alter a slug/);
  assert.match(p, /NEVER show it, its slugs, field names, or JSON to the user/);
});

test("trigger: forbids re-asking the app, and asks what happens in it first", () => {
  const p = forWake(triggerWake);
  assert.match(p, /Never re-ask which app or account/);
  assert.match(p, /What should happen in Gmail to wake this routine/);
  assert.match(p, /it is your FIRST question/);
});

test("trigger: first ask offers example options derived from the event names", () => {
  const p = forWake(triggerWake);
  assert.match(p, /"New email"/);
  assert.match(p, /"New labeled email"/);
  assert.match(p, /What the routine should do each time that happens/);
  assert.match(p, /Summarize it for me/);
});

test("trigger: omits the connected-account clause when absent", () => {
  const wake = { ...triggerWake, connectedAccountId: undefined };
  const p = forWake(wake);
  assert.doesNotMatch(p, /connected_account_id/);
});

test("trigger: caps the catalog, dropping the largest schemas first with a note", () => {
  const big = (n, size) => ({
    slug: `EVT_${n}`,
    name: `Event ${n}`,
    description: `Describes event ${n}`,
    configSchema: { type: "object", filler: "x".repeat(size) },
  });
  const wake = {
    kind: "trigger",
    toolkit: "gmail",
    toolkitName: "Gmail",
    events: [big(1, 5000), big(2, 4000), big(3, 100)],
  };
  const p = forWake(wake);
  assert.doesNotMatch(p, new RegExp("x".repeat(5000)));
  assert.match(p, /EVT_1/);
  assert.match(p, /EVT_2/);
  assert.match(p, /EVT_3/);
  assert.match(p, /filter schemas were left out of the catalog/);
});

test("trigger: no omission note when the whole catalog fits", () => {
  const p = forWake(triggerWake);
  assert.doesNotMatch(p, /filter schemas were left out/);
});

test('webhook: carries the verbatim {"kind":"webhook"} binding and no schedule', () => {
  const p = forWake(webhookWake);
  assert.match(p, /\{"kind":"webhook"\}/);
  assert.match(p, /ONE web-address trigger and no schedule/);
  assert.doesNotMatch(p, /which connected app it lives in/);
});

test("webhook: forbids re-asking the wake and refers to it in plain words", () => {
  const p = forWake(webhookWake);
  assert.match(p, /Do NOT ask when it should happen/);
  assert.match(p, /when its web address is called/);
});

test("webhook: points the user at the button above the chat, not a paste", () => {
  const p = forWake(webhookWake);
  assert.match(p, /button shown just above this chat/);
  assert.match(p, /do NOT paste any address, secret, or technical details/);
});

test("webhook: first ask offers reaction-to-being-called example options", () => {
  const p = forWake(webhookWake);
  assert.match(p, /What the routine should do. This is your FIRST question/);
  assert.match(p, /Process whatever was sent to me/);
});

test("webhook: stamps the setup activity id verbatim", () => {
  const p = forWake(webhookWake);
  assert.match(p, /"setup_activity_id" field to exactly "act_123"/);
});

test("names the connected providers in the awareness block", () => {
  const p = forWake(scheduleWake);
  assert.match(p, /"anthropic" \(Anthropic\)/);
});

test("intent present: confirms the user's own description and forbids re-asking purpose", () => {
  const p = routineIntakeHandoffPrompt(ACTIVITY, PROVIDERS, {
    intent: "Send me a market recap every morning",
    wake: scheduleWake,
  });
  assert.match(p, /Send me a market recap every morning/);
  assert.match(p, /Do NOT ask them what it should do from scratch/);
  assert.doesNotMatch(
    p,
    /What the routine should do\. This is your FIRST question/,
  );
  assert.match(p, /`0 9 \* \* \*`/);
});

test("template schedule: carried verbatim alongside the template intent", () => {
  const templateWake = {
    kind: "schedule",
    cron: "0 7 * * 1-5",
    timezone: "America/Lima",
    summary: "Runs every week on Mon, Tue, Wed, Thu, Fri at 7:00 AM",
  };
  const p = routineIntakeHandoffPrompt(ACTIVITY, PROVIDERS, {
    intent: "Give me a weekday morning briefing of my day ahead",
    wake: templateWake,
  });
  assert.match(p, /`0 7 \* \* 1-5`/);
  assert.match(p, /`America\/Lima`/);
  assert.match(p, /Runs every week on Mon, Tue, Wed, Thu, Fri at 7:00 AM/);
  assert.match(p, /Give me a weekday morning briefing of my day ahead/);
  assert.match(p, /Do NOT ask them what it should do from scratch/);
});

test("wake null (no hint): interviews for the wake and opens on what it should do", () => {
  const p = routineIntakeHandoffPrompt(ACTIVITY, PROVIDERS, {
    intent: null,
    wake: null,
    scheduleHint: null,
  });
  assert.match(p, /What the routine should do\. This is your FIRST question/);
  assert.match(p, /There are two ways a routine wakes/);
  assert.match(p, /exactly ONE wake mechanism/);
  assert.doesNotMatch(p, /already chose, in a visual picker, WHEN it runs/);
  assert.doesNotMatch(p, /already told you WHEN/);
});

test("wake null with intent (inbox triage): confirms intent AND interviews for the wake", () => {
  const p = routineIntakeHandoffPrompt(ACTIVITY, PROVIDERS, {
    intent: "When a new email arrives, summarize it for me",
    wake: null,
    scheduleHint: null,
  });
  assert.match(p, /When a new email arrives, summarize it for me/);
  assert.match(p, /Do NOT ask them what it should do from scratch/);
  assert.match(p, /There are two ways a routine wakes/);
});

test("wake null (no hint): stamps the setup activity id verbatim", () => {
  const p = routineIntakeHandoffPrompt(ACTIVITY, PROVIDERS, {
    intent: null,
    wake: null,
    scheduleHint: null,
  });
  assert.match(p, /"setup_activity_id" field to exactly "act_123"/);
});

test("schedule hint: carries the user's exact words verbatim", () => {
  const p = forHint("every second Tuesday at 3pm");
  assert.match(p, /"every second Tuesday at 3pm"/);
});

test("schedule hint: forbids re-asking when, and folds the time into the summary", () => {
  const p = forHint("every weekday morning");
  assert.match(p, /do NOT ask "when should it run" from scratch/);
  assert.match(p, /Do NOT re-ask when it should run from scratch/);
  assert.match(p, /What the routine should do\. This is your FIRST question/);
  assert.doesNotMatch(p, /There are two ways a routine wakes/);
});

test("schedule hint: states the ambiguity rule (one clarifying option-question)", () => {
  const p = forHint("sometimes");
  assert.match(p, /genuinely ambiguous/);
  assert.match(p, /ONE short clarifying question/);
});

test("schedule hint: saves the interpreted schedule and no trigger", () => {
  const p = forHint("once a day");
  assert.match(p, /exact schedule you interpreted from the user's own words/);
  assert.match(p, /ONE schedule and no app-event trigger/);
});

test("schedule hint: draws recurring purpose examples (time-based, no app-event)", () => {
  const p = forHint("once a day");
  assert.match(p, /Give me a weekly recap of what happened/);
  assert.doesNotMatch(p, /When a new email arrives, summarize it for me/);
});

test("schedule hint: stamps the setup activity id verbatim", () => {
  const p = forHint("every hour");
  assert.match(p, /"setup_activity_id" field to exactly "act_123"/);
});

test("encode wraps the prompt in the auto-continue marker", () => {
  const msg = encodeRoutineIntakeHandoffMessage(ACTIVITY, PROVIDERS, {
    intent: null,
    wake: scheduleWake,
  });
  assert.ok(msg.startsWith("<!--houston:auto_continue-->"));
  assert.match(msg, /"setup_activity_id" field to exactly "act_123"/);
});
