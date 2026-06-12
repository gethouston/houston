import type { Check } from "./validators";
import { validatePng, validatePptx, validateXlsx } from "./validators";

/**
 * The canonical tasks — the journeys we demo and sell. Each case is one agent
 * turn that must end with a real artifact in the workspace; the validator
 * scores the artifact's structure (not its prose), so a pass means "a user
 * could download and open this file".
 */
export interface EvalCase {
  id: string;
  prompt: string;
  /** Workspace-relative artifact the turn must produce. */
  artifact: string;
  /** Structural checks against the downloaded bytes. */
  validate: (bytes: Uint8Array) => Promise<Check[]>;
  /** Seconds to wait for the turn before calling it a timeout. */
  timeoutSec: number;
}

export const CASES: EvalCase[] = [
  {
    id: "deck",
    prompt:
      "Build a 5-slide PowerPoint presentation titled 'Houston Quarterly Review' " +
      "with one title slide and four content slides (wins, metrics, risks, next steps), " +
      "using placeholder content. Save it as deck.pptx in your workspace.",
    artifact: "deck.pptx",
    validate: (bytes) => validatePptx(bytes, { minSlides: 4 }),
    timeoutSec: 600,
  },
  {
    id: "spreadsheet",
    prompt:
      "Create an Excel spreadsheet with mock monthly sales data: columns Month, Units, Revenue; " +
      "12 data rows (Jan through Dec) and a totals row at the bottom. " +
      "Save it as sales.xlsx in your workspace.",
    artifact: "sales.xlsx",
    validate: (bytes) => validateXlsx(bytes),
    timeoutSec: 600,
  },
  {
    id: "chart",
    prompt:
      "Generate a bar chart image of mock monthly revenue for Jan through Dec " +
      "(make up plausible numbers) with axis labels and a title. " +
      "Save it as chart.png in your workspace.",
    artifact: "chart.png",
    validate: (bytes) => validatePng(bytes, { minBytes: 5_000 }),
    timeoutSec: 600,
  },
];
