import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENT_SETUP_AGENT_MODE,
  isAgentSetupMode,
} from "../src/lib/agent-setup-mode.ts";
import { isSetupChatMode } from "../src/lib/integration-chat-setup.ts";

describe("agent setup mode", () => {
  it("recognizes only its own namespaced sentinel", () => {
    strictEqual(isAgentSetupMode(AGENT_SETUP_AGENT_MODE), true);
    strictEqual(isAgentSetupMode("houston:routine-setup"), false);
    strictEqual(isAgentSetupMode("agent-setup"), false);
    strictEqual(isAgentSetupMode(null), false);
    strictEqual(isAgentSetupMode(undefined), false);
  });

  it("is never a hidden setup chat: the setup mission stays on the board", () => {
    strictEqual(isSetupChatMode(AGENT_SETUP_AGENT_MODE), false);
  });
});
