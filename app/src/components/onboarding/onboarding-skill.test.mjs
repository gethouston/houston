import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOnboardingSkillFile,
  ONBOARDING_SKILL_SLUG,
  pickOnboardingIntegrations,
} from "./onboarding-skill.ts";

test("slug is the kebab-case shared with the routine directive", () => {
  assert.equal(ONBOARDING_SKILL_SLUG, "plan-my-working-day");
});

test("buildOnboardingSkillFile emits a parseable SKILL.md", () => {
  const file = buildOnboardingSkillFile({
    description: "Plans my working day",
    integrations: ["gmail", "googlecalendar"],
    today: "2026-05-15",
  });
  // Frontmatter front + back delimiters.
  assert.match(file, /^---\n/);
  assert.match(file, /\n---\n/);
  // Required fields.
  assert.match(file, /name: plan-my-working-day/);
  assert.match(file, /description: Plans my working day/);
  assert.match(file, /version: 1/);
  assert.match(file, /tags: \[\]/);
  assert.match(file, /created: 2026-05-15/);
  assert.match(file, /last_used: 2026-05-15/);
  assert.match(file, /category: planning/);
  assert.match(file, /featured: yes/);
  assert.match(file, /integrations: \[gmail, googlecalendar\]/);
  assert.match(file, /image: spiral-calendar/);
  // Procedure body.
  assert.match(file, /## Procedure/);
  assert.ok(file.endsWith("\n"));
});

test("buildOnboardingSkillFile flips integrations to Outlook stack", () => {
  const file = buildOnboardingSkillFile({
    description: "Plans my working day",
    integrations: ["outlook", "outlook_calendar"],
    today: "2026-05-15",
  });
  assert.match(file, /integrations: \[outlook, outlook_calendar\]/);
});

test("pickOnboardingIntegrations prefers Google when both stacks connected", () => {
  const all = new Set([
    "gmail",
    "googlecalendar",
    "outlook",
    "outlook_calendar",
  ]);
  assert.deepEqual(pickOnboardingIntegrations(all), [
    "gmail",
    "googlecalendar",
  ]);
});

test("pickOnboardingIntegrations picks Outlook when Google is missing", () => {
  const outlook = new Set(["outlook", "outlook_calendar"]);
  assert.deepEqual(pickOnboardingIntegrations(outlook), [
    "outlook",
    "outlook_calendar",
  ]);
});

test("pickOnboardingIntegrations falls back to Google when neither pair is complete", () => {
  // Half-Google connection — better to declare gmail+googlecalendar than nothing.
  const partial = new Set(["gmail"]);
  assert.deepEqual(pickOnboardingIntegrations(partial), [
    "gmail",
    "googlecalendar",
  ]);
});
