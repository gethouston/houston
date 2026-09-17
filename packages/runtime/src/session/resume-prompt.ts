import { AUTO_CONTINUE_MARKER } from "@houston/protocol";
import type { ResumeRequest } from "./resume-request";

/**
 * What the model is told when its turn is picked up after a restart
 * (PRODUCT-1785). Model-facing English (the engine is prompt-agnostic in
 * language; the USER-facing line is translated in the app), carried as a hidden
 * auto-continue message so no bubble the user never typed appears in the
 * transcript — every surface folds that marker away (`@houston/sdk`).
 *
 * It names the survivors explicitly because the model cannot see them: the
 * workspace files are on disk, everything the dead process was holding is not.
 * Without that, the model re-ran finished work from the top — the bug this
 * fixes. The original request is quoted in full: the dead process took the
 * provider session with it, so "continue" alone can land on a model that no
 * longer knows what was asked.
 */
export const RESUME_PROMPT_LEAD =
  "A restart interrupted your previous reply while you were working on this request:";

export const RESUME_PROMPT_GUIDANCE = [
  "Files you saved in the workspace survived the restart.",
  "Temporary folders, unfinished installs, and anything you had running did not.",
  "Check what already exists in the workspace before redoing anything, continue from there, and briefly tell the user what was kept and what had to be redone.",
].join(" ");

/** The hidden user message a resume sends: the marker, then the framing. */
export function encodeResumePrompt(request: ResumeRequest): string {
  return [
    AUTO_CONTINUE_MARKER,
    RESUME_PROMPT_LEAD,
    request.text,
    RESUME_PROMPT_GUIDANCE,
  ].join("\n\n");
}
