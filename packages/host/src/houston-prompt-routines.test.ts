import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { routinesGuidance } from "./houston-prompt-routines";

const rust = readFileSync(
  new URL(
    "../../../app/src-tauri/src/houston_prompt/routines.rs",
    import.meta.url,
  ),
  "utf8",
);

test.each([
  true,
  false,
])("routine chat choices describe what the user sees with triggers=%s", (triggers) => {
  for (const copy of [routinesGuidance(triggers), rust]) {
    expect(copy).toContain("Where should I put each new email I handle?");
    expect(copy).toContain("A new chat for each email");
    expect(copy).toContain("All in one chat");
    expect(copy).toContain(
      "Option labels must be distinguishable on their own",
    );
    expect(copy).toContain(
      'Never ask about "results", "history", or "organizing"',
    );
    expect(copy).toContain("Each email gets a separate conversation.");
    expect(copy).toContain("Each email continues the same conversation.");
  }
});
