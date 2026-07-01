import { osReadRecentLogs, osReportBug } from "./os-bridge";

interface BugReportContext {
  command: string;
  error: string;
  spaceName?: string;
  workspaceName?: string;
  userEmail?: string | null;
  timestamp: string;
  appVersion: string;
  /** Free-text feedback the user typed (only present on voluntary
   *  "Send feedback" submissions, never on auto-generated error paths). */
  userMessage?: string;
}

async function getRecentLogs(
  lines = 50,
): Promise<{ backend: string; frontend: string }> {
  try {
    return await osReadRecentLogs(lines);
  } catch {
    return { backend: "(unavailable)", frontend: "(unavailable)" };
  }
}

export async function reportBug(
  context: BugReportContext,
): Promise<string | null> {
  const logs = await getRecentLogs();

  return await osReportBug({
    ...context,
    logs,
  });
}
