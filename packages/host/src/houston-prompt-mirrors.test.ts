import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { BASE } from "./houston-prompt-base";
import { INTEGRATIONS } from "./houston-prompt-integrations";
import { routinesGuidance } from "./houston-prompt-routines";

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
