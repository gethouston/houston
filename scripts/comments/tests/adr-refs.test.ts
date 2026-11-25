import { describe, expect, it } from "vitest";
import { checkAdr, type RepoView } from "../adr-refs.ts";

const sources: Record<string, string> = {
  "packages/runtime/src/backends/pi/wire.ts":
    "export function normalizeUsage() {}\nconst totalTokens = 1;",
  "packages/runtime/src/backends/pi/session.ts": "export class PiSession {}",
  "packages/host/src/routes/meta.ts": "export const metaRoutes = [];",
  "app/src/components/chat-panel.tsx": "export function useChatPanel() {}",
};
const files = new Set(Object.keys(sources));
const dirs = new Set(
  [...files].flatMap((file) =>
    file
      .split("/")
      .slice(0, -1)
      .map((_, i, parts) => parts.slice(0, i + 1).join("/")),
  ),
);

const codeWords = new Set(["refresh_token_invalidated", "COMPOSIO_API_KEY"]);

const repo: RepoView = {
  roots: new Set(["app", "packages", "docs"]),
  retired: new Set(["packages/host-cloud"]),
  isFile: (path) => files.has(path),
  isDir: (path) => dirs.has(path),
  under: (dir, suffix) =>
    [...files, ...dirs].filter(
      (path) => path.startsWith(`${dir}/`) && path.endsWith(`/${suffix}`),
    ),
  source: (path) =>
    sources[path] ??
    Object.entries(sources)
      .filter(([file]) => file.startsWith(`${path}/`))
      .map(([, text]) => text)
      .join("\n"),
  inCode: (word) => codeWords.has(word),
};

const messages = (text: string): string[] =>
  checkAdr(text, repo).map(({ line, message }) => `${line}: ${message}`);

describe("check:adr-refs", () => {
  it("passes when every path and paired symbol is real", () => {
    expect(
      messages(
        [
          "# Pi backend (packages/runtime/src/backends/pi/wire.ts)",
          "",
          "- `normalizeUsage` sums the parts because Gemini omits `totalTokens`.",
          "Lives in `packages/runtime/src/backends/pi/session.ts` (`PiSession`).",
          "`normalizeUsage` (`wire.ts`) and `PiSession` in `session.ts`.",
          "Relative to `packages/host/`: `src/routes/meta.ts` (`metaRoutes`).",
          "The retired `packages/host-cloud` must never come back.",
          "User data such as `.houston/config.json`, `config.json` and `dist/main.mjs` is not a repo path.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("reports a path that does not exist", () => {
    expect(
      messages(
        "Lives in `packages/runtime/src/gone.ts`, `missing.ts` and app/src/old.tsx.",
      ),
    ).toEqual([
      "1: names packages/runtime/src/gone.ts, which does not exist",
      "1: names missing.ts, which does not exist",
      "1: names app/src/old.tsx, which does not exist",
    ]);
  });

  it("resolves a relative path only under a directory the ADR names", () => {
    expect(messages("See `chat-panel.tsx`.")).toEqual([
      "1: names chat-panel.tsx, which does not exist",
    ]);
    expect(
      messages("Covers `app/src/components/`. See `chat-panel.tsx`."),
    ).toEqual([]);
  });

  it.each([
    [
      "a parenthesized list after a path",
      "Lives in `packages/runtime/src/backends/pi/wire.ts` (`normalizeUsage`, `sumParts`).",
      "sumParts",
    ],
    [
      "a symbol followed by its file",
      "`readUsage` (`packages/runtime/src/backends/pi/wire.ts`) sums.",
      "readUsage",
    ],
    [
      "a symbol in a file",
      "`PiSession.close` in `packages/runtime/src/backends/pi/session.ts`.",
      "close",
    ],
  ])("reports a symbol named in %s that the file lacks", (_, text, missing) => {
    const [problem] = messages(text);
    expect(problem).toMatch(new RegExp(`which do not contain ${missing}$`));
  });

  it("checks the leading symbol of each line under a heading that names files", () => {
    expect(
      messages(
        [
          "## Usage (packages/runtime/src/backends/pi/wire.ts)",
          "",
          "- `normalizeUsage` stays.",
          "- `renamedAway` moved.",
          "## Next section",
          "- `renamedAway` is not checked here.",
        ].join("\n"),
      ),
    ).toEqual([
      "4: names `renamedAway` next to packages/runtime/src/backends/pi/wire.ts, which do not contain renamedAway",
    ]);
  });

  it("skips any path under a retired prefix", () => {
    expect(
      messages(
        "`packages/host-cloud/src/server.ts` and packages/host-cloud/src/db.ts are gone.",
      ),
    ).toEqual([]);
  });

  it("checks env names and error codes under a heading against all code", () => {
    expect(
      messages(
        [
          "## Refresh (packages/runtime/src/backends/pi/wire.ts)",
          "",
          "- `refresh_token_invalidated` is terminal.",
          "- `COMPOSIO_API_KEY` turns it on.",
          "- `none` is plain prose.",
          "- `invalid_client` is never terminal.",
          "- `HOUSTON_GONE` was removed.",
        ].join("\n"),
      ),
    ).toEqual([
      "6: names `invalid_client`, which no code in the repo contains",
      "7: names `HOUSTON_GONE`, which no code in the repo contains",
    ]);
  });
});
