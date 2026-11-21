import { config } from "../config";
import { RunCodeLimiter } from "../session/tools/run-code-limiter";

export const turnRunCodeLimiter = new RunCodeLimiter({
  maxConcurrent: config.runCodeMaxConcurrent,
  maxPerMinute: config.runCodePerMinute,
});
