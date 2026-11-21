import { privateDirOf, privateDirProblem } from "./private-paths";

const logged = new Set<string>();

export function privateDirGate(): (file: string) => Promise<boolean> {
  return async (file) => {
    const dir = privateDirOf(file);
    return dir ? trusted(dir) : true;
  };
}

async function trusted(dir: string): Promise<boolean> {
  let problem: string | null;
  try {
    problem = await privateDirProblem(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    problem = "is missing";
  }
  if (problem === null) return true;
  const line = `${dir} ${problem}`;
  if (!logged.has(line)) {
    logged.add(line);
    console.error(`[object-sync] not syncing sign-in state: ${line}`);
  }
  return false;
}
