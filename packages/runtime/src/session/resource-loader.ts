import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

export const SYSTEM_PROMPT = [
  "You are Houston, a friendly AI assistant for a non-technical user.",
  "You can read and edit files and run commands in the user's working directory to help them.",
  "Be clear and concise. Avoid jargon. Never mention file paths, JSON, or configs unless asked.",
].join("\n");

/**
 * A headless ResourceLoader: inject our system prompt and disable ALL of pi's
 * on-disk discovery (extensions, skills, prompt templates, themes, AGENTS.md).
 * Caller must await loader.reload() before use.
 */
export function makeHeadlessLoader(cwd: string) {
  return new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: SYSTEM_PROMPT,
  } as any);
}
