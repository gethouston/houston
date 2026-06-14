import { strict as assert } from "node:assert"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

// HOU-458: `streamdown` (our chat markdown renderer) imports `remend`, a
// self-healing-markdown library, and evaluates it at import time. remend@1.3.0
// shipped its `singleTilde` strikethrough guard as a regex with a LOOKBEHIND
// assertion: `/(?<=[\p{L}\p{N}_])~(?!~)(?=[\p{L}\p{N}_])/gu`. JavaScriptCore in
// older system WebViews (the WKWebView Tauri uses on Safari < 16.4 / older
// macOS) does not support lookbehind: it parses `(?<` as the start of a named
// group, hits the `=`, and throws `SyntaxError: Invalid regular expression:
// invalid group specifier name` at PARSE time. Because the throw happens while
// the `streamdown` module graph is being evaluated — before React renders —
// the <ErrorBoundary> around <Streamdown> in message.tsx can't catch it, and
// the whole chat surface blanks for those users.
//
// We carry a pnpm patch (patches/remend@1.3.0.patch) that rewrites the
// lookbehind into an equivalent capturing group. These tests track the remend
// copy that `streamdown` actually loads and fail loudly if the patch is ever
// dropped or a remend bump reintroduces a lookbehind.

// Locate the remend that `streamdown` resolves to. remend's `exports` map has
// no `require`/`default` condition, so `require.resolve("remend")` is blocked;
// resolve `streamdown` (a direct dependency) instead and walk pnpm's layout to
// its sibling `remend`, then read that package's declared entry point.
function resolveRemendEntry(): string {
  const streamdownEntry = fileURLToPath(import.meta.resolve("streamdown"))
  let streamdownRoot = dirname(streamdownEntry)
  while (!existsSync(join(streamdownRoot, "package.json"))) {
    const parent = dirname(streamdownRoot)
    if (parent === streamdownRoot) {
      throw new Error(`no package.json above ${streamdownEntry}`)
    }
    streamdownRoot = parent
  }
  // pnpm flattens peers into one store dir, so remend is a sibling of
  // streamdown's package root; a nested install is the non-pnpm fallback.
  const remendDir = [
    join(dirname(streamdownRoot), "remend"),
    join(streamdownRoot, "node_modules", "remend"),
  ].find((dir) => existsSync(join(dir, "package.json")))
  if (!remendDir) throw new Error("could not locate remend next to streamdown")
  const pkg = JSON.parse(
    readFileSync(join(remendDir, "package.json"), "utf8"),
  ) as { main?: string; module?: string }
  return join(remendDir, pkg.main ?? pkg.module ?? "dist/index.js")
}

const remendEntry = resolveRemendEntry()

describe("remend regex compatibility (HOU-458)", () => {
  it("ships no regex lookbehind that crashes older WebKit", () => {
    const source = readFileSync(remendEntry, "utf8")
    const lookbehinds = source.match(/\(\?<[=!]/g)
    assert.equal(
      lookbehinds,
      null,
      `remend's bundle contains a regex lookbehind ${JSON.stringify(
        lookbehinds,
      )}, which throws at parse time on older WebKit. The HOU-458 patch ` +
        "(patches/remend@1.3.0.patch) is missing or a remend bump reintroduced it.",
    )
  })

  it("preserves singleTilde behavior after the lookbehind rewrite", async () => {
    const { default: remend } = (await import(
      pathToFileURL(remendEntry).href
    )) as { default: (text: string, options?: unknown) => string }

    // The rewrite turns the zero-width lookbehind into a capturing group, so
    // the preceding word character is now consumed by the match and must be
    // re-emitted. These assertions catch the off-by-one that would drop it.
    assert.equal(remend("20~25"), "20\\~25") // documented: 20~25 -> 20\~25
    assert.equal(remend("a~b~c"), "a\\~b\\~c") // back-to-back intra-word tildes
    // Real strikethrough (double tilde) must stay untouched.
    assert.equal(remend("~~done~~"), "~~done~~")
    // A tilde without a word character on both sides is not escaped.
    assert.equal(remend("~start"), "~start")
    assert.equal(remend("end~"), "end~")
  })
})
