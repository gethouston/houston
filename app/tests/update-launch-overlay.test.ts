import { doesNotMatch, match, ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/shell/update-launch-overlay.tsx", import.meta.url),
  "utf8",
);
const coreImports = source.match(
  /import\s*\{([^}]+)\}\s*from\s*"@houston-ai\/core"/,
)?.[1];

describe("the launch-time update dialog uses the shared frame", () => {
  it("imports AlertDialog and AlertDialogContent from @houston-ai/core", () => {
    ok(coreImports);
    match(coreImports, /\bAlertDialog\b/);
    match(coreImports, /\bAlertDialogContent\b/);
    match(source, /<AlertDialog\s/);
    match(source, /<AlertDialogContent\s/);
  });

  it("leaves the shadow, stacking, scrim, role, radius and border to the frame", () => {
    doesNotMatch(
      source,
      /shadow-\[|bg-black\/|role="alertdialog"|rounded-2xl|border-line/,
    );
    // The one layering rule the gate keeps: above the tutorial band
    // (`z-[60]`, tutorial-spotlight-veil.tsx), which would otherwise paint
    // its cutout veil over the install's recovery controls.
    match(source, /className="[^"]*\bz-\[70\]/);
    doesNotMatch(source, /z-\[(?![67]0\])/);
  });

  it("caps width with sm:max-w-md and keeps the phone gutter", () => {
    match(source, /\bsm:max-w-md\b/);
    doesNotMatch(source, /(?<!sm:)\bmax-w-|\bw-\[/);
  });

  it("uses the core Button for the full-width primary action with no native button", () => {
    ok(coreImports);
    match(coreImports, /\bButton\b/);
    match(source, /<Button\s[^>]*className="w-full"/);
    doesNotMatch(source, /<button\b/);
  });

  it("stays open and prevents Escape while installation or recovery is required", () => {
    match(source, /<AlertDialog\s+open\s/);
    match(source, /onOpenChange=\{\(\) => undefined\}/);
    match(source, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/);
    // An alert dialog with no Cancel gets no focus from Radix; the content
    // takes it, or the user's focus is stranded on the inert app behind.
    match(source, /onOpenAutoFocus=/);
    match(source, /tabIndex=\{-1\}/);
    doesNotMatch(source, /<AlertDialog(?:Cancel|Action)\b/);
  });

  it("puts the logo in the frame's media slot and the title names the dialog", () => {
    match(
      source,
      /<AlertDialogMedia>[\s\S]*?houston-update-logo-light[\s\S]*?<\/AlertDialogMedia>/,
    );
    doesNotMatch(source, /aria-label=/);
    match(
      source,
      /<AlertDialogTitle[^>]*>\s*\{t\("updateChecker\.launchTitle"\)\}/,
    );
    match(source, /<AlertDialogDescription aria-live="assertive">/);
    match(source, /<p\s+aria-live="polite"[^>]*>\s*\{message\}/);
  });

  it("preserves both logos, the version pill and the progress bar", () => {
    match(source, /houston-update-logo-light/);
    match(source, /houston-update-logo-dark/);
    match(source, /v\{info\.currentVersion\}/);
    match(source, /→/);
    match(source, /v\{info\.version\}/);
    match(source, /style=\{\{ width: `\$\{progress \?\? 35\}%` \}\}/);
  });

  it("keeps installing disabled with a spinner and selects retry or relaunch on error", () => {
    match(source, /disabled=\{!error\}/);
    match(source, /<Loader2 className="size-4 animate-spin"/);
    match(source, /onClick=\{relaunchOnly \? onRelaunch : onRetry\}/);
    match(
      source,
      /relaunchOnly\s*\? t\("updateChecker\.relaunchAction"\)\s*: error\s*\? t\("updateChecker\.retryAction"\)\s*: t\("updateChecker\.installing"\)/,
    );
  });
});
