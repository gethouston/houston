export type Language = "python" | "bash" | "node";
export const LANGUAGES: readonly Language[] = ["python", "bash", "node"];
export const isLanguage = (s: unknown): s is Language =>
  typeof s === "string" && (LANGUAGES as readonly string[]).includes(s);

export interface InputFile {
  path: string;
  contentBase64: string;
}

export interface RunRequest {
  language: Language;
  code: string;
  files?: InputFile[];
  timeoutMs?: number;
}

export interface Artifact {
  path: string;
  contentBase64: string;
  bytes: number;
}

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  artifacts: Artifact[];
  droppedArtifacts: string[];
  durationMs: number;
}

export interface Limits {
  maxTimeoutMs: number;
  defaultTimeoutMs: number;
  maxOutputBytes: number;
  maxInputFiles: number;
  maxArtifactBytes: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxTimeoutMs: 120_000,
  defaultTimeoutMs: 60_000,
  maxOutputBytes: 256 * 1024,
  maxInputFiles: 64,
  maxArtifactBytes: 16 * 1024 * 1024,
};
