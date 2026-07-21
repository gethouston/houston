import assert from "node:assert/strict";
import { test } from "node:test";
import {
  availableTemplates,
  INTAKE_TEMPLATES,
  resolveTemplateWake,
} from "./templates.ts";

test("defines the five example routines in order", () => {
  assert.deepEqual(
    INTAKE_TEMPLATES.map((t) => t.id),
    [
      "morningBriefing",
      "weeklyReview",
      "deadlineReminders",
      "inboxTriage",
      "newsDigest",
    ],
  );
});

test("schedule templates carry their default cron; inbox triage carries none", () => {
  const byId = Object.fromEntries(INTAKE_TEMPLATES.map((t) => [t.id, t]));
  assert.equal(byId.morningBriefing.cron, "0 7 * * 1-5"); // weekdays 7:00
  assert.equal(byId.weeklyReview.cron, "0 16 * * 5"); // Friday 16:00
  assert.equal(byId.deadlineReminders.cron, "0 9 * * *"); // daily 9:00
  assert.equal(byId.newsDigest.cron, "0 8 * * *"); // daily 8:00
  assert.equal(byId.inboxTriage.cron, undefined); // AI interviews for the wake
  assert.equal(byId.inboxTriage.requiresTriggers, true);
});

test("availableTemplates drops the app-event template without triggers", () => {
  const withoutTriggers = availableTemplates(false).map((t) => t.id);
  assert.ok(!withoutTriggers.includes("inboxTriage"));
  assert.equal(withoutTriggers.length, 4);
  assert.equal(availableTemplates(true).length, 5);
});

test("resolveTemplateWake: a cron template becomes a timezoned schedule pick", () => {
  const template = INTAKE_TEMPLATES.find((t) => t.id === "morningBriefing");
  const wake = resolveTemplateWake(
    template,
    "America/Lima",
    (cron) => `summary(${cron})`,
  );
  assert.deepEqual(wake, {
    kind: "schedule",
    cron: "0 7 * * 1-5",
    timezone: "America/Lima",
    summary: "summary(0 7 * * 1-5)",
  });
});

test("resolveTemplateWake: a cron-less template leaves the wake to the AI", () => {
  const template = INTAKE_TEMPLATES.find((t) => t.id === "inboxTriage");
  const wake = resolveTemplateWake(template, "America/Lima", () => "unused");
  assert.equal(wake, null);
});
