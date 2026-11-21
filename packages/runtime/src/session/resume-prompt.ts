import { AUTO_CONTINUE_MARKER } from "@houston/protocol";
import type { ResumeRequest } from "./resume-request";

export const RESUME_PROMPT_LEAD =
  "A restart interrupted your previous reply while you were working on this request:";

export const RESUME_PROMPT_GUIDANCE = [
  "Files you saved in the workspace survived the restart.",
  "Temporary folders, unfinished installs, and anything you had running did not.",
  "Check what already exists in the workspace before redoing anything, continue from there, and briefly tell the user what was kept and what had to be redone.",
].join(" ");

export function encodeResumePrompt(request: ResumeRequest): string {
  return [
    AUTO_CONTINUE_MARKER,
    RESUME_PROMPT_LEAD,
    request.text,
    RESUME_PROMPT_GUIDANCE,
  ].join("\n\n");
}
