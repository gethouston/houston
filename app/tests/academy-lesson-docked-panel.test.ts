import { doesNotMatch, match } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (file: string) =>
  readFileSync(
    new URL(`../src/components/academy/lessons/${file}`, import.meta.url),
    "utf8",
  );
const panel = read("lesson-docked-panel.tsx");

describe("Academy docked lesson dialog", () => {
  it("uses the shared modal frame and exits when it dismisses", () => {
    match(
      panel,
      /import\s*\{\s*Dialog,\s*DialogContent\s*\}\s*from\s*"@houston-ai\/core"/,
    );
    match(panel, /<Dialog\s+open\s/);
    match(panel, /onOpenChange=\{\(\) => undefined\}/);
    doesNotMatch(panel, /modal=\{false\}/);
    // No Radix path ends the lesson: the runner owns Escape (a synthetic
    // Escape from the app's own housekeeping must not exit a run), and a
    // stray click beside a playing video must not abandon the beat.
    match(panel, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/);
    match(
      panel,
      /onInteractOutside=\{\(event\) => event\.preventDefault\(\)\}/,
    );
    match(panel, /aria-labelledby=\{undefined\}/);
    match(panel, /<DialogContent\s/);
    match(panel, /aria-label=\{label\}/);
    match(panel, /aria-describedby=\{undefined\}/);
  });

  it("leaves frame styling to the shared dialog", () => {
    for (const forbidden of [
      /bg-black\//,
      /z-40/,
      /z-\[/,
      /ht-shadow-modal/,
      /animate-in/,
      /role="dialog"/,
      /rounded-2xl/,
      /bg-dialog/,
      /motion-reduce:/,
      /flex flex-col/,
      /\bp-6\b/,
      /\bmb-4\b/,
    ]) {
      doesNotMatch(panel, forbidden);
    }
    match(panel, /sm:max-w-lg/);
    doesNotMatch(panel, /(?:^|[\s"'`])max-w-/);
    match(panel, /max-h-\[85dvh\] overflow-y-auto/);
    doesNotMatch(panel, /shrink-0/);
  });

  it("keeps the chrome's exit and the card's initial focus", () => {
    match(panel, /showCloseButton=\{false\}/);
    match(panel, /onOpenAutoFocus=\{\(event\) => event\.preventDefault\(\)\}/);
    match(panel, /<LessonBeatChrome[\s\S]*?onExit=\{onExit\}/);
  });

  it("keeps the whisper on its own non-modal surface", () => {
    match(read("lesson-spotlight.tsx"), /ht-shadow-modal/);
  });
});
