import test from "node:test";
import assert from "node:assert/strict";
import {
  filesFromClipboardData,
  filesFromClipboardItems,
  ensureFileName,
  clipboardSignalsImage,
  resolveClipboardPaste,
} from "../src/clipboard-files.ts";

test("extracts file items from clipboard data", () => {
  const image = new File(["png"], "screenshot.png", { type: "image/png" });
  const pdf = new File(["pdf"], "brief.pdf", { type: "application/pdf" });

  assert.deepEqual(
    filesFromClipboardItems([
      { kind: "string", getAsFile: () => null },
      { kind: "file", getAsFile: () => image },
      { kind: "file", getAsFile: () => pdf },
    ]),
    [image, pdf],
  );
});

test("ignores empty and text-only clipboard data", () => {
  assert.deepEqual(filesFromClipboardItems(null), []);
  assert.deepEqual(
    filesFromClipboardItems([{ kind: "string", getAsFile: () => null }]),
    [],
  );
});

test("extracts clipboard files list when items do not include files", () => {
  const image = new File(["jpg"], "photo.jpg", { type: "image/jpeg" });

  assert.deepEqual(
    filesFromClipboardData({
      files: [image],
      items: [{ kind: "string", getAsFile: () => null }],
    }),
    [image],
  );
});

test("deduplicates files exposed through both clipboard APIs", () => {
  const image = new File(["png"], "screenshot.png", {
    type: "image/png",
    lastModified: 10,
  });

  assert.deepEqual(
    filesFromClipboardData({
      files: [image],
      items: [{ kind: "file", getAsFile: () => image }],
    }),
    [image],
  );
});

test("extracts image from mixed clipboard with both text and image", () => {
  const image = new File(["png"], "screenshot.png", { type: "image/png" });

  assert.deepEqual(
    filesFromClipboardData({
      files: [],
      items: [
        { kind: "string", type: "text/plain", getAsFile: () => null },
        { kind: "file", type: "image/png", getAsFile: () => image },
      ],
    }),
    [image],
  );
});

test("ensureFileName keeps a real name and returns the same instance", () => {
  const file = new File(["x"], "report.png", { type: "image/png" });
  assert.equal(ensureFileName(file), file);
});

test("ensureFileName regenerates blank and whitespace-only names", () => {
  const blank = new File(["x"], "", { type: "image/png" });
  const spaces = new File(["x"], "   ", { type: "image/gif" });

  assert.match(ensureFileName(blank).name, /^pasted-\d+-0\.png$/);
  assert.match(ensureFileName(spaces).name, /^pasted-\d+-0\.gif$/);
});

test("ensureFileName maps known image MIME types to extensions", () => {
  const cases = [
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/gif", "gif"],
    ["image/webp", "webp"],
    ["image/bmp", "bmp"],
    ["image/svg+xml", "svg"],
  ];
  for (const [type, ext] of cases) {
    const named = ensureFileName(new File(["x"], "", { type }));
    assert.match(named.name, new RegExp(`^pasted-\\d+-0\\.${ext}$`));
    assert.equal(named.type, type);
  }
});

test("ensureFileName falls back to the MIME subtype, then to bin", () => {
  assert.match(
    ensureFileName(new File(["x"], "", { type: "application/zip" })).name,
    /^pasted-\d+-0\.zip$/,
  );
  assert.match(
    ensureFileName(new File(["x"], "", { type: "" })).name,
    /^pasted-\d+-0\.bin$/,
  );
});

test("ensureFileName uses the index to disambiguate", () => {
  const file = new File(["x"], "", { type: "image/webp" });
  assert.match(ensureFileName(file, 3).name, /^pasted-\d+-3\.webp$/);
});

test("multiple unnamed images in one paste get distinct names", () => {
  const first = new File(["aa"], "", { type: "image/png" });
  const second = new File(["b"], "", { type: "image/jpeg" });

  const out = filesFromClipboardData({
    items: [
      { kind: "file", getAsFile: () => first },
      { kind: "file", getAsFile: () => second },
    ],
  });

  assert.equal(out.length, 2);
  assert.match(out[0].name, /^pasted-\d+-0\.png$/);
  assert.match(out[1].name, /^pasted-\d+-1\.jpg$/);
  assert.notEqual(out[0].name, out[1].name);
});

test("filesFromClipboardData tolerates null and undefined", () => {
  assert.deepEqual(filesFromClipboardData(null), []);
  assert.deepEqual(filesFromClipboardData(undefined), []);
});

test("dedupe keeps distinct unnamed images that share size and mtime", () => {
  // Same byte length + same lastModified + empty name: only the MIME type
  // tells them apart. The shared identity triple alone would over-merge.
  // Both files arrive via items (the primary source) — realistic when a
  // clipboard entry exposes multiple image formats simultaneously.
  const png = new File(["x"], "", { type: "image/png", lastModified: 7 });
  const jpg = new File(["x"], "", { type: "image/jpeg", lastModified: 7 });

  const out = filesFromClipboardData({
    items: [
      { kind: "file", getAsFile: () => png },
      { kind: "file", getAsFile: () => jpg },
    ],
  });

  assert.equal(out.length, 2);
  assert.match(out[0].name, /^pasted-\d+-0\.png$/);
  assert.match(out[1].name, /^pasted-\d+-1\.jpg$/);
});

test("dedupe still collapses the same unnamed file exposed via both APIs", () => {
  const img = new File(["x"], "", { type: "image/png", lastModified: 7 });

  assert.deepEqual(
    filesFromClipboardData({
      files: [img],
      items: [{ kind: "file", getAsFile: () => img }],
    }).length,
    1,
  );
});

test("ensureFileName strips MIME parameters and suffixes from the extension", () => {
  const parametrized = ensureFileName(
    new File(["x"], "", { type: "text/plain;charset=utf-8" }),
  );
  assert.match(parametrized.name, /^pasted-\d+-0\.plain$/);
  assert.doesNotMatch(parametrized.name, /[;=+]/);

  // Dotted vendor subtype is not a clean token -> fall back to bin.
  assert.match(
    ensureFileName(new File(["x"], "", { type: "application/vnd.api+json" }))
      .name,
    /^pasted-\d+-0\.bin$/,
  );
});

test("clipboardSignalsImage detects an advertised but unreadable image", () => {
  assert.equal(
    clipboardSignalsImage({
      items: [{ kind: "file", type: "image/png", getAsFile: () => null }],
    }),
    true,
  );
  assert.equal(
    clipboardSignalsImage({
      items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
    }),
    false,
  );
  assert.equal(clipboardSignalsImage(null), false);
});

test("resolveClipboardPaste returns files when an image is readable", () => {
  const image = new File(["png"], "shot.png", { type: "image/png" });
  const outcome = resolveClipboardPaste({
    items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
  });

  assert.equal(outcome.kind, "files");
  assert.deepEqual(outcome.kind === "files" && outcome.files, [image]);
});

test("resolveClipboardPaste flags unreadable images instead of swallowing them", () => {
  const outcome = resolveClipboardPaste({
    items: [{ kind: "file", type: "image/png", getAsFile: () => null }],
  });
  assert.equal(outcome.kind, "unavailable");
});

test("resolveClipboardPaste ignores text-only and empty clipboards", () => {
  assert.equal(
    resolveClipboardPaste({
      items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
    }).kind,
    "ignore",
  );
  assert.equal(resolveClipboardPaste(null).kind, "ignore");
});

test("filesFromClipboardItems skips items where getAsFile() returns null", () => {
  const image = new File(["png"], "shot.png", { type: "image/png" });
  assert.deepEqual(
    filesFromClipboardItems([
      { kind: "file", getAsFile: () => null },
      { kind: "file", getAsFile: () => image },
    ]),
    [image],
  );
});

test("filesFromClipboardData falls back to files when items is null", () => {
  const image = new File(["jpg"], "photo.jpg", { type: "image/jpeg" });
  assert.deepEqual(filesFromClipboardData({ files: [image], items: null }), [
    image,
  ]);
});
