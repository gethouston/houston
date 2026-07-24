import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ChatInteractionAnswer } from "@houston-ai/chat";
// Imported from source (not the barrel) so node's --experimental-strip-types
// runner needn't resolve the package's extensionless .tsx re-exports.
import { decodeInteractionAnswersMessage } from "../../ui/chat/src/interaction-answers-message.ts";
import { isAutoContinueMessage } from "../src/lib/auto-continue-message.ts";
import {
  type ConnectOutcome,
  type CredentialOutcome,
  composeInteractionReply,
  encodeInteractionAnswersMessage,
  finalConnectNames,
  finalCredentialNames,
} from "../src/lib/interaction-reply.ts";

const answers: ChatInteractionAnswer[] = [
  { stepId: "q1", question: "To whom?", answer: "john@example.com" },
  { stepId: "q2", question: "Saying what?", answer: "Running late" },
];

/** The i18n line factories plus empty accumulators; tests spread overrides. */
const base = {
  answers: [] as ChatInteractionAnswer[],
  connectedNames: [] as string[],
  skippedConnectNames: [] as string[],
  credentialedNames: [] as string[],
  skippedCredentialNames: [] as string[],
  connectRedirects: [] as { name: string; text: string }[],
  credentialRedirects: [] as { name: string; text: string }[],
  signinDeclineText: undefined as string | undefined,
  hasQuestionSteps: false,
  signedIn: false,
  signinSkipped: false,
  connectedLine: (name: string) => `Connected ${name}.`,
  skippedConnectLine: (name: string) => `Skipped connecting ${name}.`,
  connectRedirectLine: (name: string, text: string) =>
    `I didn't connect ${name}. Instead, do this: ${text}`,
  credentialRedirectLine: (name: string, text: string) =>
    `I didn't add the ${name} key. Instead, do this: ${text}`,
  signinRedirectLine: (text: string) =>
    `I didn't sign in. Instead, do this: ${text}`,
  credentialedLine: (name: string) => `Added the ${name} key.`,
  signedInLine: "Signed in to Houston.",
  skippedSigninLine: "Skipped signing in.",
  signedInFollowup: "I've signed in. Please continue.",
  skippedCredentialLine: (name: string) => `Skipped adding the ${name} key.`,
  credentialedFollowup: "I've added the Acme key. Please continue.",
};

describe("composeInteractionReply", () => {
  it("sends question answers as a VISIBLE message", () => {
    const reply = composeInteractionReply({
      ...base,
      answers,
      hasQuestionSteps: true,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late",
    );
  });

  it("appends a Connected line per connection in a mixed sequence", () => {
    const reply = composeInteractionReply({
      ...base,
      answers,
      connectedNames: ["Gmail"],
      hasQuestionSteps: true,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late\nConnected Gmail.",
    );
  });

  // The claim this locks: a connect-only sequence must NOT resume the agent
  // per-connect (which tore the card down mid-sequence). It walks EVERY connect
  // step, then sends ONE hidden auto-continue message naming all of them.
  it("names every connection in ONE hidden message for a connect-only sequence", () => {
    const reply = composeInteractionReply({
      ...base,
      connectedNames: ["Gmail", "Slack"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.split("\n").length, 4); // marker + blank + two lines
    strictEqual(reply.includes("Connected Gmail."), true);
    strictEqual(reply.includes("Connected Slack."), true);
  });

  it("hides a single connect-only reply too", () => {
    const reply = composeInteractionReply({
      ...base,
      connectedNames: ["Gmail"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("Connected Gmail."), true);
  });

  // ── Sign-in composition ────────────────────────────────────────────────
  it("adds the signed-in line before Connected lines in a question+signin+connect sequence", () => {
    const reply = composeInteractionReply({
      ...base,
      answers,
      connectedNames: ["Gmail"],
      hasQuestionSteps: true,
      signedIn: true,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late\nSigned in to Houston.\nConnected Gmail.",
    );
  });

  it("hides a signin+connect sequence and orders sign-in before connects", () => {
    const reply = composeInteractionReply({
      ...base,
      connectedNames: ["Gmail"],
      signedIn: true,
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.includes("Signed in to Houston."), true);
    strictEqual(
      reply.indexOf("Signed in to Houston.") <
        reply.indexOf("Connected Gmail."),
      true,
    );
  });

  it("resumes a signin-only sequence with the hidden followup", () => {
    const reply = composeInteractionReply({ ...base, signedIn: true });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("I've signed in. Please continue."), true);
    strictEqual(reply.includes("Signed in to Houston."), false);
  });

  // ── Skip composition ───────────────────────────────────────────────────
  // A skipped connect step is a fact the agent MUST hear (or it re-requests the
  // same app forever): it joins the visible reply after the Connected lines.
  it("appends a Skipped line per skipped connect step in a mixed sequence", () => {
    const reply = composeInteractionReply({
      ...base,
      answers,
      connectedNames: ["Gmail"],
      skippedConnectNames: ["Slack"],
      hasQuestionSteps: true,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late\nConnected Gmail.\nSkipped connecting Slack.",
    );
  });

  // A fully-skipped connect-only sequence still resumes the agent (hidden),
  // telling it the user declined — never a silent dead end.
  it("hides a skipped connect-only sequence but names the declined app", () => {
    const reply = composeInteractionReply({
      ...base,
      skippedConnectNames: ["Gmail"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("Skipped connecting Gmail."), true);
  });

  // A skipped sign-in is NOT a sign-in: the followup shortcut must not fire,
  // and the skip line rides the hidden resume instead.
  it("resumes a skipped signin-only sequence with the skip line, not the followup", () => {
    const reply = composeInteractionReply({ ...base, signinSkipped: true });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("Skipped signing in."), true);
    strictEqual(reply.includes("I've signed in."), false);
  });

  // Signed in for real, then skipped the connect: the followup shortcut is for
  // a signin-ONLY sequence — a skipped connect is a fact that must survive.
  it("keeps the skip line when a signin succeeded but the connect was skipped", () => {
    const reply = composeInteractionReply({
      ...base,
      signedIn: true,
      skippedConnectNames: ["Gmail"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.includes("Signed in to Houston."), true);
    strictEqual(reply.includes("Skipped connecting Gmail."), true);
    strictEqual(reply.includes("I've signed in. Please continue."), false);
  });

  // A connect step declined WITH typed text carries the user's instruction, so
  // the sequence resumes VISIBLY (not the hidden connect-only auto-continue).
  it("resumes a connect decline-with-text VISIBLY naming the instruction", () => {
    const reply = composeInteractionReply({
      ...base,
      connectRedirects: [{ name: "Slack", text: "use my work account" }],
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "I didn't connect Slack. Instead, do this: use my work account",
    );
  });

  // A sign-in step declined WITH typed text resumes visibly too.
  it("resumes a sign-in decline-with-text VISIBLY", () => {
    const reply = composeInteractionReply({
      ...base,
      signinSkipped: true,
      signinDeclineText: "keep working signed out",
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "Skipped signing in.\nI didn't sign in. Instead, do this: keep working signed out",
    );
  });

  // A credential decline-with-text overrides the credential-only hidden followup:
  // one key saved + one redirected must resume VISIBLY and keep BOTH lines.
  it("keeps a saved key AND a credential redirect, resuming VISIBLY", () => {
    const reply = composeInteractionReply({
      ...base,
      credentialedNames: ["Acme"],
      credentialRedirects: [{ name: "Globex", text: "read it from env" }],
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "Added the Acme key.\nI didn't add the Globex key. Instead, do this: read it from env",
    );
  });
});

describe("credential composition", () => {
  // ── Credential composition (HOU-550) ───────────────────────────────────
  // A credential-only sequence mirrors signin-only: no factual line to relay,
  // so it resumes with the dedicated hidden followup naming the integration.
  it("resumes a credential-only sequence with the hidden followup", () => {
    const reply = composeInteractionReply({
      ...base,
      credentialedNames: ["Acme"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(
      reply.endsWith("I've added the Acme key. Please continue."),
      true,
    );
    strictEqual(reply.includes("Added the Acme key."), false);
  });

  // A mixed sequence (questions + credential) keeps the visible answers and
  // appends an "Added the X key." line, exactly like Connected lines.
  it("appends an Added-key line per credential in a mixed sequence", () => {
    const reply = composeInteractionReply({
      ...base,
      answers,
      credentialedNames: ["Acme"],
      hasQuestionSteps: true,
    });
    strictEqual(isAutoContinueMessage(reply), false);
    strictEqual(
      reply,
      "To whom?: john@example.com\nSaying what?: Running late\nAdded the Acme key.",
    );
  });

  // A SKIPPED credential is a fact the agent MUST hear (or it waits on a key
  // that never comes): a skip-only sequence resumes HIDDEN naming the decline.
  it("hides a credential-skip-only sequence but names the decline", () => {
    const reply = composeInteractionReply({
      ...base,
      skippedCredentialNames: ["Acme"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.endsWith("Skipped adding the Acme key."), true);
    strictEqual(reply.includes("Please continue."), false);
  });

  // A save + a skip in the same sequence keeps BOTH facts (the credentialed
  // followup shortcut must NOT swallow the skip): saved line then skipped line.
  it("names both a saved and a skipped credential when they mix", () => {
    const reply = composeInteractionReply({
      ...base,
      credentialedNames: ["Acme"],
      skippedCredentialNames: ["Globex"],
    });
    strictEqual(isAutoContinueMessage(reply), true);
    strictEqual(reply.includes("Added the Acme key."), true);
    strictEqual(reply.includes("Skipped adding the Globex key."), true);
    strictEqual(reply.includes("Please continue."), false);
  });
});

describe("finalConnectNames", () => {
  const outcomes = (
    entries: [string, ConnectOutcome][],
  ): Map<string, ConnectOutcome> => new Map(entries);

  it("splits final outcomes into connected + skipped, in step order", () => {
    const { connectedNames, skippedConnectNames } = finalConnectNames(
      ["c1", "c2", "c3"],
      outcomes([
        ["c1", { name: "Gmail", connected: true }],
        ["c2", { name: "Slack", connected: false }],
        ["c3", { name: "GitHub", connected: true }],
      ]),
    );
    deepStrictEqual(connectedNames, ["Gmail", "GitHub"]);
    deepStrictEqual(skippedConnectNames, ["Slack"]);
  });

  // The reconsider fix: a step skipped then connected records connected LAST, so
  // it names "Connected", never a stale "Skipped connecting". One line per step.
  it("reports Connected for a step skipped then reconsidered (last write wins)", () => {
    const map = outcomes([["c1", { name: "Slack", connected: false }]]);
    // The user walked Back and connected after all — the panel overwrites.
    map.set("c1", { name: "Slack", connected: true });
    const { connectedNames, skippedConnectNames } = finalConnectNames(
      ["c1"],
      map,
    );
    deepStrictEqual(connectedNames, ["Slack"]);
    deepStrictEqual(skippedConnectNames, []);
  });

  // Skip -> Back -> skip again: the key overwrite keeps exactly ONE skip line.
  it("keeps a single skip line when a step is skipped more than once", () => {
    const map = outcomes([["c1", { name: "Gmail", connected: false }]]);
    map.set("c1", { name: "Gmail", connected: false });
    const { connectedNames, skippedConnectNames } = finalConnectNames(
      ["c1"],
      map,
    );
    deepStrictEqual(skippedConnectNames, ["Gmail"]);
    deepStrictEqual(connectedNames, []);
  });

  it("omits a step that was never reached (no recorded outcome)", () => {
    const { connectedNames, skippedConnectNames } = finalConnectNames(
      ["c1", "c2"],
      outcomes([["c1", { name: "Gmail", connected: true }]]),
    );
    deepStrictEqual(connectedNames, ["Gmail"]);
    deepStrictEqual(skippedConnectNames, []);
  });

  // A decline WITH typed text lands in connectRedirects (carries user text, so
  // the sequence resumes visibly), never the plain skipped list. A bare skip
  // (no message, or whitespace-only) stays a plain skip.
  it("routes a decline-with-text into connectRedirects, not skipped", () => {
    const { connectedNames, skippedConnectNames, connectRedirects } =
      finalConnectNames(
        ["c1", "c2", "c3"],
        outcomes([
          ["c1", { name: "Gmail", connected: true }],
          [
            "c2",
            { name: "Slack", connected: false, message: "use my work one" },
          ],
          ["c3", { name: "GitHub", connected: false }],
        ]),
      );
    deepStrictEqual(connectedNames, ["Gmail"]);
    deepStrictEqual(skippedConnectNames, ["GitHub"]);
    deepStrictEqual(connectRedirects, [
      { name: "Slack", text: "use my work one" },
    ]);
  });

  it("treats an empty decline message as a plain skip", () => {
    const { skippedConnectNames, connectRedirects } = finalConnectNames(
      ["c1"],
      outcomes([["c1", { name: "Slack", connected: false, message: "" }]]),
    );
    deepStrictEqual(skippedConnectNames, ["Slack"]);
    deepStrictEqual(connectRedirects, []);
  });
});

describe("finalCredentialNames", () => {
  const outcomes = (
    entries: [string, CredentialOutcome][],
  ): Map<string, CredentialOutcome> => new Map(entries);

  it("splits final outcomes into saved + skipped, in step order", () => {
    const { credentialedNames, skippedCredentialNames } = finalCredentialNames(
      ["k1", "k2", "k3"],
      outcomes([
        ["k1", { name: "Acme", saved: true }],
        ["k2", { name: "Globex", saved: false }],
        ["k3", { name: "Initech", saved: true }],
      ]),
    );
    deepStrictEqual(credentialedNames, ["Acme", "Initech"]);
    deepStrictEqual(skippedCredentialNames, ["Globex"]);
  });

  // The reconsider fix: a step skipped then saved records saved LAST, so it
  // names "Added", never a stale "Skipped adding". One line per step.
  it("reports saved for a step skipped then reconsidered (last write wins)", () => {
    const map = outcomes([["k1", { name: "Acme", saved: false }]]);
    map.set("k1", { name: "Acme", saved: true });
    const { credentialedNames, skippedCredentialNames } = finalCredentialNames(
      ["k1"],
      map,
    );
    deepStrictEqual(credentialedNames, ["Acme"]);
    deepStrictEqual(skippedCredentialNames, []);
  });

  it("omits a credential step that was never reached", () => {
    const { credentialedNames, skippedCredentialNames } = finalCredentialNames(
      ["k1", "k2"],
      outcomes([["k1", { name: "Acme", saved: true }]]),
    );
    deepStrictEqual(credentialedNames, ["Acme"]);
    deepStrictEqual(skippedCredentialNames, []);
  });

  // A decline WITH typed text lands in credentialRedirects (mirrors connect).
  it("routes a decline-with-text into credentialRedirects, not skipped", () => {
    const { credentialedNames, skippedCredentialNames, credentialRedirects } =
      finalCredentialNames(
        ["k1", "k2"],
        outcomes([
          ["k1", { name: "Acme", saved: false, message: "read it from env" }],
          ["k2", { name: "Globex", saved: false }],
        ]),
      );
    deepStrictEqual(credentialedNames, []);
    deepStrictEqual(skippedCredentialNames, ["Globex"]);
    deepStrictEqual(credentialRedirects, [
      { name: "Acme", text: "read it from env" },
    ]);
  });
});

describe("encodeInteractionAnswersMessage", () => {
  it("keeps the flat model body identical to composeInteractionReply", () => {
    const shared = {
      ...base,
      answers,
      connectedNames: ["Gmail"],
      hasQuestionSteps: true,
      signedIn: true,
    };
    const encoded = encodeInteractionAnswersMessage(shared);
    const flat = composeInteractionReply(shared);
    strictEqual(encoded.endsWith(`\n\n${flat}`), true);
    strictEqual(encoded.startsWith("<!--houston:interaction-answers "), true);
  });

  it("carries a structured payload that decodes back to the same Q&A", () => {
    const encoded = encodeInteractionAnswersMessage({
      ...base,
      answers,
      connectedNames: ["Gmail"],
      skippedConnectNames: ["Slack"],
      credentialedNames: ["Acme"],
      hasQuestionSteps: true,
      signedIn: true,
    });
    const payload = decodeInteractionAnswersMessage(encoded);
    deepStrictEqual(payload, {
      lines: [
        { question: "To whom?", answer: "john@example.com" },
        { question: "Saying what?", answer: "Running late" },
        { answer: "Signed in to Houston." },
        { answer: "Connected Gmail." },
        { answer: "Skipped connecting Slack." },
        { answer: "Added the Acme key." },
      ],
    });
  });

  // A decline-with-instruction rides the VISIBLE structured payload too — the
  // connect/credential/signin redirect lines read the same for model and user.
  it("carries the decline-with-instruction lines in the payload, in order", () => {
    const encoded = encodeInteractionAnswersMessage({
      ...base,
      signinSkipped: true,
      signinDeclineText: "keep working signed out",
      connectRedirects: [{ name: "Slack", text: "use my work account" }],
      credentialRedirects: [{ name: "Acme", text: "read it from env" }],
    });
    const payload = decodeInteractionAnswersMessage(encoded);
    deepStrictEqual(payload, {
      lines: [
        { answer: "Skipped signing in." },
        {
          answer: "I didn't sign in. Instead, do this: keep working signed out",
        },
        {
          answer:
            "I didn't connect Slack. Instead, do this: use my work account",
        },
        {
          answer:
            "I didn't add the Acme key. Instead, do this: read it from env",
        },
      ],
    });
  });

  it("does NOT mark a hidden connect-only sequence (no visible bubble)", () => {
    const encoded = encodeInteractionAnswersMessage({
      ...base,
      connectedNames: ["Gmail"],
    });
    strictEqual(isAutoContinueMessage(encoded), true);
    strictEqual(decodeInteractionAnswersMessage(encoded), null);
  });

  it("does NOT mark a hidden signin-only sequence", () => {
    const encoded = encodeInteractionAnswersMessage({
      ...base,
      signedIn: true,
    });
    strictEqual(isAutoContinueMessage(encoded), true);
    strictEqual(decodeInteractionAnswersMessage(encoded), null);
  });

  it("does NOT mark a hidden credential-only sequence", () => {
    const encoded = encodeInteractionAnswersMessage({
      ...base,
      credentialedNames: ["Acme"],
    });
    strictEqual(isAutoContinueMessage(encoded), true);
    strictEqual(decodeInteractionAnswersMessage(encoded), null);
  });

  // A mixed question + credential-skip sequence surfaces the skipped-key line
  // in the VISIBLE payload too, aligned with the "Skipped connecting" pattern.
  it("humanizes a skipped credential in the visible payload", () => {
    const encoded = encodeInteractionAnswersMessage({
      ...base,
      answers,
      skippedCredentialNames: ["Acme"],
      hasQuestionSteps: true,
    });
    const payload = decodeInteractionAnswersMessage(encoded);
    deepStrictEqual(payload?.lines.slice(-1), [
      { answer: "Skipped adding the Acme key." },
    ]);
  });
});
