import { expect, test } from "vitest";
import { systemPromptFor } from "./resource-loader";

test("the fallback base prompt never names the agent Houston", () => {
  for (const mode of ["disabled", "local"] as const) {
    const prompt = systemPromptFor(mode);
    expect(prompt).toContain(
      "You are a friendly AI assistant inside Houston, working for a non-technical user.",
    );
    expect(prompt).not.toContain("You are Houston");
  }
});
