import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { HandsOnSurface, PendingInteraction } from "@houston/protocol";
import {
  deriveActiveInteraction,
  interactionNotificationBodyKey,
} from "../src/lib/active-interaction.ts";
import { handsOnSurfaceReachable } from "../src/lib/hands-on-gates.ts";
import {
  apiKeyNameAgentId,
  handsOnAgentSettings,
  handsOnManagerOnly,
  handsOnScreenLabel,
  inlineHandsOn,
  resolveHandsOnAgent,
} from "../src/lib/hands-on-screens.ts";
import { finalHandsOnNames } from "../src/lib/interaction-outcomes.ts";
import { composeInteractionReply } from "../src/lib/interaction-reply.ts";
import { resolvePlanReadyOverride } from "../src/lib/plan-ready.ts";
import type { SurfaceGates } from "../src/lib/surface-gates-model.ts";

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
  const finished = reply({ finishedScreens: ["Billing"] });
  ok(finished.includes("Opened Billing and finished there."));
  ok(!finished.startsWith("Opened"), "an unasked bubble is never shown");
  ok(
    reply({ skippedScreens: ["Billing"] }).includes("Skipped opening Billing."),
  );
});

test("a signed-in or credentialed sequence carrying an errand keeps its facts", () => {
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
  const body = reply({
    handsOnRedirects: [{ name: "Billing", text: "Stay on the free tier" }],
  });
  strictEqual(body, "I didn't open Billing. Instead: Stay on the free tier");
});

const readSrc = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("the card keeps no state across the navigation it triggers", () => {
  const card = readSrc("../src/components/chat-hands-on-interaction-card.tsx");
  ok(
    !card.includes("useState"),
    "the outcome log behind the stepper is the memory",
  );
  ok(card.includes("openHandsOnSurface(surface as HandsOnSurface"));
  ok(
    card.includes("handsOnSurfaceReachable(surface, gates"),
    "a screen this person cannot open never gets a button",
  );
});

const gates = (over: Partial<SurfaceGates> = {}): SurfaceGates => ({
  showOrganization: true,
  showBilling: true,
  showWorkspaceDanger: true,
  showAiModels: true,
  showApiKeys: true,
  manageWorkspaceSkills: true,
  showAssistant: true,
  ready: true,
  ...over,
});

test("an errand to a screen this person does not hold offers no way in", () => {
  for (const [surface, denied] of [
    ["billing", { showBilling: false }],
    ["billing", { showOrganization: false }],
    ["orgDanger", { showWorkspaceDanger: false }],
    ["apiKeys", { showApiKeys: false }],
    ["agentApiAccess", { showApiKeys: false }],
  ] as const satisfies [HandsOnSurface, Partial<SurfaceGates>][])
    strictEqual(handsOnSurfaceReachable(surface, gates(denied)), false);
  for (const surface of ["apiKeys", "files", "routineWebhook"] as const)
    strictEqual(
      handsOnSurfaceReachable(
        surface,
        gates({
          showOrganization: false,
          showBilling: false,
          showWorkspaceDanger: false,
        }),
      ),
      true,
    );
});

test("an employee's API access needs the API and that employee's Settings", () => {
  strictEqual(handsOnSurfaceReachable("agentApiAccess", gates(), true), true);
  strictEqual(handsOnSurfaceReachable("agentApiAccess", gates(), false), false);
  strictEqual(
    handsOnSurfaceReachable(
      "agentApiAccess",
      gates({ showApiKeys: false }),
      true,
    ),
    false,
  );
  strictEqual(handsOnSurfaceReachable("agentApiAccess", gates()), true);
  strictEqual(handsOnSurfaceReachable("files", gates(), false), true);
});

const ana = { id: "a1", name: "Ana", access: "manager" } as const;
const bo = { id: "a2", name: "Bo", access: "user" } as const;
const settled = { loaded: true, loading: false, agents: [ana, bo] };
const loadingRoster = { loaded: false, loading: true, agents: [] };
const member = { multiplayer: true, role: "user" } as unknown as Parameters<
  typeof handsOnAgentSettings
>[1];

test("an employee's screen opens only for the employee the step names", () => {
  deepStrictEqual(resolveHandsOnAgent("a1", settled), {
    kind: "found",
    agent: ana,
  });
  deepStrictEqual(resolveHandsOnAgent(undefined, settled), { kind: "absent" });
  deepStrictEqual(resolveHandsOnAgent("gone", settled), { kind: "absent" });
  deepStrictEqual(resolveHandsOnAgent("gone", loadingRoster), {
    kind: "pending",
  });
  deepStrictEqual(resolveHandsOnAgent("gone", { ...settled, loading: true }), {
    kind: "pending",
  });
});

test("an employee's API access opens for its managers alone", () => {
  const open = (
    agentId: string | undefined,
    roster: Parameters<typeof resolveHandsOnAgent>[1] = settled,
  ) =>
    handsOnSurfaceReachable(
      "agentApiAccess",
      gates(),
      handsOnAgentSettings(resolveHandsOnAgent(agentId, roster), member),
    );
  strictEqual(open("a1"), true);
  strictEqual(open("a2"), false);
  strictEqual(open(undefined), false);
  strictEqual(open("gone"), false);
  strictEqual(open("gone", loadingRoster), true);
});

test("an employee's screen is titled with that employee", () => {
  const names = (id: string) => settled.agents.find((a) => a.id === id)?.name;
  deepStrictEqual(
    handsOnScreenLabel({ surface: "agentApiAccess", agentId: "a1" }, names),
    { key: "interaction.handsOnAgentApiAccessFor", name: "Ana" },
  );
  deepStrictEqual(
    handsOnScreenLabel({ surface: "agentApiAccess", agentId: "x" }, names),
    { key: "interaction.handsOnScreens.agentApiAccess" },
  );
  deepStrictEqual(
    handsOnScreenLabel({ surface: "files", agentId: "a1" }, names),
    { key: "interaction.handsOnScreens.files" },
  );
  deepStrictEqual(handsOnScreenLabel({ surface: "newScreen" }, names), {
    key: "interaction.handsOnUnknownScreen",
  });
});

test("a key minted beside an employee's API access defaults to that employee", () => {
  strictEqual(
    apiKeyNameAgentId([
      { kind: "hands_on", id: "h1", surface: "apiKeys" },
      { kind: "hands_on", id: "h2", surface: "agentApiAccess", agentId: "a1" },
    ]),
    "a1",
  );
  strictEqual(
    apiKeyNameAgentId([{ kind: "hands_on", id: "h1", surface: "apiKeys" }]),
    undefined,
  );
  strictEqual(
    apiKeyNameAgentId([
      { kind: "hands_on", id: "h1", surface: "files", agentId: "a1" },
    ]),
    undefined,
  );
});

test("only the AI Manager's chat runs the API errands in place", () => {
  strictEqual(inlineHandsOn("apiKeys", true), "apiKey");
  strictEqual(inlineHandsOn("agentApiAccess", true), "agentApi");
  strictEqual(inlineHandsOn("apiKeys", false), null);
  strictEqual(inlineHandsOn("agentApiAccess", false), null);
  for (const surface of ["files", "billing", "routineWebhook", "orgDanger"])
    strictEqual(inlineHandsOn(surface, true), null);
  strictEqual(handsOnManagerOnly("agentApiAccess"), true);
  strictEqual(handsOnManagerOnly("apiKeys"), false);
});

test("an unsettled gate never calls a screen missing", () => {
  strictEqual(
    handsOnSurfaceReachable(
      "billing",
      gates({ ready: false, showOrganization: false, showBilling: false }),
    ),
    true,
  );
  strictEqual(
    handsOnSurfaceReachable("billing", gates({ showBilling: true })),
    true,
  );
});

test("every hands-on screen maps to a real navigation", () => {
  const nav = readSrc("../src/lib/hands-on-navigation.ts");
  for (const call of [
    'ui.openSettings("apiKeys")',
    "ui.openSettings(null)",
    'openAdmin({ section: "billing" })',
    "openAgentSection(",
    '"files" : "routines"',
  ])
    ok(nav.includes(call), `missing navigation: ${call}`);
});
