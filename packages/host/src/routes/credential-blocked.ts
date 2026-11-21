import type { ServerResponse } from "node:http";
import { PROVIDER_ACCOUNT_BLOCKED_CODE } from "../credentials/account-blocked";
import { json } from "./http";

export function answerAccountBlocked(
  res: ServerResponse,
  detail: string,
): true {
  json(
    res,
    502,
    {
      error: "provider account blocked",
      code: PROVIDER_ACCOUNT_BLOCKED_CODE,
      detail,
    },
    { "retry-after": "60" },
  );
  return true;
}
