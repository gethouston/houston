import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
// Deep import: the @houston-ai/chat barrel drags in React components that
// node:test cannot resolve; the decoder module itself is dependency-free.
import { decodeSkillMessage } from "../../ui/chat/src/skill-message.ts";
import {
  encodeRoutineSetupMessage,
  ROUTINE_SETUP_PROMPT,
} from "../src/lib/routine-chat-setup.ts";

// The "Create it in chat" first message must round-trip through the shared
// skill-marker decoder: the renderer draws a friendly card from the marker
// payload while the model reads only the kickoff prompt after it. If either
// side drifts, non-technical users see raw interview instructions as their
// own message.

const LABELS = {
  title: "Set up a routine",
  description: "Your agent will ask a few questions and schedule it for you.",
};

describe("routine chat setup message", () => {
  it("decodes as a skill-invocation card with the localized labels", () => {
    const body = encodeRoutineSetupMessage(LABELS);
    const invocation = decodeSkillMessage(body);
    ok(invocation, "marker must decode");
    strictEqual(invocation.displayName, LABELS.title);
    strictEqual(invocation.description, LABELS.description);
    // No composer text: the mission-card subtitle falls back to the
    // description instead of leaking prompt internals.
    strictEqual(invocation.message, "");
    strictEqual(invocation.attachments.length, 0);
  });

  it("carries the kickoff prompt as the model-facing body", () => {
    const body = encodeRoutineSetupMessage(LABELS);
    ok(body.startsWith("<!--houston:skill "));
    ok(body.endsWith(ROUTINE_SETUP_PROMPT));
  });

  it("kickoff prompt covers the interview the issue asks for", () => {
    // Load-bearing beats: interview via ask_user, chat-mode choice, quiet
    // runs, approval gate, and no model/provider questions for
    // non-technical users.
    for (const needle of [
      "ask_user",
      "one ongoing chat",
      "fresh chat",
      "needs their attention",
      "approval",
      "Do not ask about models, providers",
    ]) {
      ok(
        ROUTINE_SETUP_PROMPT.includes(needle),
        `prompt must mention: ${needle}`,
      );
    }
  });

  it("card labels never leak into the model prompt", () => {
    // The prompt is a fixed constant; labels live only in the marker JSON.
    ok(!ROUTINE_SETUP_PROMPT.includes(LABELS.description));
  });
});
