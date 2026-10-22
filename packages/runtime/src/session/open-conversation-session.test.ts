import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * A session built on the standing server without the recorded context fill
 * sizes its first request's first-byte deadline as if the conversation were
 * empty, and an 800k-token conversation times out at the small-prompt deadline.
 * `openConversationSession` is the build path that supplies it.
 */
test("the standing server builds sessions only through openConversationSession", () => {
  const sessionDir = dirname(fileURLToPath(import.meta.url));
  const builders = readdirSync(sessionDir, {
    recursive: true,
    encoding: "utf8",
  })
    .filter(
      (file) => file.endsWith(".ts") && !/\.test(-support)?\.ts$/.test(file),
    )
    .filter((file) =>
      readFileSync(join(sessionDir, file), "utf8").includes(".createSession("),
    );
  expect(builders).toEqual(["open-conversation-session.ts"]);
});
