import {
  PREFERENCE_EXISTS_CODE,
  PREFERENCE_EXISTS_STATUS,
  PREFERENCE_ONLY_IF_ABSENT_FIELD,
} from "@houston/protocol";
import { json } from "./http";
import * as state from "./state";

export function handlePreference(
  method: string,
  key: string,
  body: Record<string, unknown> | undefined,
): Response {
  if (method === "GET") return json({ value: state.getPreference(key) });
  if (method === "PUT") {
    const value =
      body?.value === null || body?.value === undefined
        ? null
        : String(body.value);
    const stored = state.getPreference(key);
    if (body?.[PREFERENCE_ONLY_IF_ABSENT_FIELD] === true && stored?.trim())
      return json(
        { code: PREFERENCE_EXISTS_CODE, value: stored },
        PREFERENCE_EXISTS_STATUS,
      );
    state.setPreference(key, value);
    return json({ value });
  }
  return json({ error: "not found" }, 404);
}
