import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { BASE } from "./houston-prompt-base";
import { INTEGRATIONS } from "./houston-prompt-integrations";
import { routinesGuidance } from "./houston-prompt-routines";

/**
 * The desktop ships its own copy of the product prompt
 * (`app/src-tauri/src/houston_prompt/`), handed to the host as
 * HOUSTON_APP_SYSTEM_PROMPT. Each section there is a raw string literal, so
 * its bytes are the prompt's bytes and can be compared to the TypeScript
 * constant whole: a wording change made on one side fails here until it is
 * made on the other. The desktop's routines copy is the event-capable variant.
 */
function rustLiteral(file: string, name: string): string | undefined {
  const source = readFileSync(
    fileURLToPath(
      new URL(
        `../../../app/src-tauri/src/houston_prompt/${file}`,
        import.meta.url,
      ),
    ),
    "utf8",
  );
  return source.match(
    new RegExp(`pub const ${name}: &str = r#"([\\s\\S]*?)"#;`),
  )?.[1];
}

test.each([
  ["base.rs", "HOUSTON_SYSTEM_PROMPT", BASE],
  ["integrations.rs", "PI_INTEGRATIONS_GUIDANCE", INTEGRATIONS],
  ["routines.rs", "ROUTINES_GUIDANCE", routinesGuidance(true)],
])("%s is byte-identical to the host copy", (file, name, host) => {
  expect(rustLiteral(file, name)).toBe(host);
});
