import { describe, expect, it } from "vitest";
import { apiSetupPrompt, HOUSTON_API_KEY_ENV } from "./api-setup-prompt";

const input = {
  baseUrl: "https://gateway.gethouston.ai/",
  agentId: "3f9a1c07b2e84d65",
  agentName: "Revenue Manager",
  orgId: "8c41e7a0d39b2f16",
};

describe("apiSetupPrompt", () => {
  it("names the employee, both IDs and the org header", () => {
    const prompt = apiSetupPrompt(input);
    expect(prompt).toContain('"Revenue Manager"');
    expect(prompt).toContain("Agent ID: 3f9a1c07b2e84d65");
    expect(prompt).toContain("x-houston-org: 8c41e7a0d39b2f16");
    expect(prompt).toContain(
      "POST https://gateway.gethouston.ai/v1/agents/3f9a1c07b2e84d65/missions",
    );
    expect(prompt).not.toContain("ai//v1");
  });

  it("explains how to continue the same mission", () => {
    expect(apiSetupPrompt(input)).toContain(
      'POST https://gateway.gethouston.ai/v1/agents/3f9a1c07b2e84d65/missions/<id>/messages with JSON {"input": "what to do next"}',
    );
  });

  it("points at the key's env var and never carries a key", () => {
    const prompt = apiSetupPrompt(input);
    expect(prompt).toContain(`${HOUSTON_API_KEY_ENV} environment variable`);
    expect(prompt).toContain("Settings > API keys");
    expect(prompt).not.toMatch(/hst_[0-9a-f]/);
  });

  it("escapes an agent id into the path", () => {
    const prompt = apiSetupPrompt({ ...input, agentId: "a b" });
    expect(prompt).toContain("/v1/agents/a%20b/missions");
  });
});
