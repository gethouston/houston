import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { PendingInteraction } from "@houston/protocol";
import {
  deriveActiveInteraction,
  interactionNotificationBodyKey,
} from "../src/lib/active-interaction.ts";
import { finalHandsOnNames } from "../src/lib/interaction-outcomes.ts";
import { composeInteractionReply } from "../src/lib/interaction-reply.ts";
import { resolvePlanReadyOverride } from "../src/lib/plan-ready.ts";

const interaction: PendingInteraction = {
  steps: [
    {
      kind: "hands_on",
      id: "h1",
      surface: "billing",
      reason: "Only you can put a card on file.",
    },
  ],
};

test("an errand blocks the composer and reads as its own completion body", () => {
  strictEqual(
    deriveActiveInteraction({
      running: false,
      live: interaction,
      persisted: undefined,
      missionStatus: undefined,
    }),
    interaction,
  );
  deepStrictEqual(resolvePlanReadyOverride(interaction.steps, null), {
    kind: "stepper",
    steps: interaction.steps,
  });
  // Without its own body the notification reads "finished working", which is
  // the one thing a mission waiting on the person is not.
  strictEqual(
    interactionNotificationBodyKey(interaction),
    "sessionComplete.handsOn",
  );
  strictEqual(
    deriveActiveInteraction({
      running: true,
      live: interaction,
      persisted: undefined,
      missionStatus: undefined,
    }),
    null,
  );
});

test("an errand reconsidered after a skip reports the FINAL answer only", () => {
  const outcomes = new Map([
    ["h1", { name: "Billing", finished: false, message: "Use the free tier" }],
    ["h2", { name: "API keys", finished: false }],
  ]);
  deepStrictEqual(finalHandsOnNames(["h1", "h2"], outcomes), {
    finishedScreens: [],
    skippedScreens: ["API keys"],
    handsOnRedirects: [{ name: "Billing", text: "Use the free tier" }],
  });
  outcomes.set("h1", { name: "Billing", finished: true });
  deepStrictEqual(finalHandsOnNames(["h1", "h2"], outcomes), {
    finishedScreens: ["Billing"],
    skippedScreens: ["API keys"],
    handsOnRedirects: [],
  });
});

const reply = (over: Partial<Parameters<typeof composeInteractionReply>[0]>) =>
  composeInteractionReply({
    answers: [],
    connectedNames: [],
    skippedConnectNames: [],
    credentialedNames: [],
    skippedCredentialNames: [],
    finishedScreens: [],
    skippedScreens: [],
    handsOnRedirects: [],
    connectRedirects: [],
    credentialRedirects: [],
    hasQuestionSteps: false,
    signedIn: false,
    signinSkipped: false,
    connectedLine: (n) => `Connected ${n}.`,
    skippedConnectLine: (n) => `Skipped connecting ${n}.`,
    credentialedLine: (n) => `Added the ${n} key.`,
    skippedCredentialLine: (n) => `Skipped adding the ${n} key.`,
    signedInLine: "Signed in to Houston.",
    skippedSigninLine: "Skipped signing in.",
    signedInFollowup: "I've signed in. Please continue.",
    connectRedirectLine: (n, t) => `I didn't connect ${n}. Instead: ${t}`,
    credentialRedirectLine: (n, t) => `I didn't add ${n}. Instead: ${t}`,
    signinRedirectLine: (t) => `I didn't sign in. Instead: ${t}`,
    credentialedFollowup: "I've added the key. Please continue.",
    handsOnLine: (s) => `Opened ${s} and finished there.`,
    handsOnSkippedLine: (s) => `Skipped opening ${s}.`,
    handsOnRedirectLine: (s, t) => `I didn't open ${s}. Instead: ${t}`,
    ...over,
  });

test("an errand-only sequence resumes the agent hidden, with the fact stated", () => {
  // Nothing observes the screen, so the reply IS the evidence: it must carry
  // the person's own answer rather than ride a generic followup.
  const finished = reply({ finishedScreens: ["Billing"] });
  ok(finished.includes("Opened Billing and finished there."));
  ok(!finished.startsWith("Opened"), "an unasked bubble is never shown");
  ok(
    reply({ skippedScreens: ["Billing"] }).includes("Skipped opening Billing."),
  );
});

test("a signed-in or credentialed sequence carrying an errand keeps its facts", () => {
  // The two hidden shortcuts exist because there was nothing else to relay. An
  // errand IS something else, so taking the shortcut would silently drop it.
  const signin = reply({ signedIn: true, skippedScreens: ["API keys"] });
  ok(signin.includes("Signed in to Houston."));
  ok(signin.includes("Skipped opening API keys."));
  const credential = reply({
    credentialedNames: ["Acme"],
    finishedScreens: ["Files"],
  });
  ok(credential.includes("Added the Acme key."));
  ok(credential.includes("Opened Files and finished there."));
});

test("a typed instruction on a declined errand resumes the chat VISIBLY", () => {
  // The user wrote something; hiding the bubble would hide their own words.
  const body = reply({
    handsOnRedirects: [{ name: "Billing", text: "Stay on the free tier" }],
  });
  strictEqual(body, "I didn't open Billing. Instead: Stay on the free tier");
});

const readSrc = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("the card keeps no state across the navigation it triggers", () => {
  // Opening the screen unmounts the chat panel, so a latched "opened" flag
  // would be gone by the time the person came back to say Done.
  const card = readSrc("../src/components/chat-hands-on-interaction-card.tsx");
  ok(
    !card.includes("useState"),
    "the outcome log behind the stepper is the memory",
  );
  ok(card.includes("openHandsOnSurface(surface as HandsOnSurface)"));
  ok(
    card.includes("isHandsOnSurface(surface)"),
    "a screen this build cannot open never gets a button",
  );
});

test("every hands-on screen maps to a real navigation", () => {
  // The protocol vocabulary is closed precisely so this map can be total: an
  // errand always has a screen behind its button.
  const nav = readSrc("../src/lib/hands-on-navigation.ts");
  for (const call of [
    'ui.openSettings("apiKeys")',
    "ui.openSettings(null)",
    'requestTab("billing")',
    "ui.openTeamView(",
    '"files" : "routines"',
  ])
    ok(nav.includes(call), `missing navigation: ${call}`);
});
