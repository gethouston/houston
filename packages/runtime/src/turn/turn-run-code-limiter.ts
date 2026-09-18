import { config } from "../config";
import { RunCodeLimiter } from "../session/tools/run-code-limiter";

/**
 * The `run_code` budget of this WORKER, shared by every turn it serves.
 *
 * A turn worker builds its tools per turn, so a limiter created alongside the
 * tool would bound one turn and nothing else —
 * HOUSTON_RUN_CODE_MAX_CONCURRENT / HOUSTON_RUN_CODE_PER_MINUTE would stop
 * being a cap at all on a worker that serves turns back to back. Holding it at
 * module scope makes the process the budget's owner, which is the unit that
 * actually shares the sandbox fleet's capacity.
 */
export const turnRunCodeLimiter = new RunCodeLimiter({
  maxConcurrent: config.runCodeMaxConcurrent,
  maxPerMinute: config.runCodePerMinute,
});
