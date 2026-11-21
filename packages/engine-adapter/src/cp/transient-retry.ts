import { assertRequestIdentity } from "@houston/sdk/auth-replay";
import { parseFilePreviewRefusal } from "@houston/wire-types";
import {
  classifyUnavailableBody,
  retryDelaysFor,
  type UnavailableReason,
} from "./unavailable-reason";

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

const CALLER_OWNED_RETRY_PATHS: ReadonlySet<string> = new Set([
  "/v1/assistant",
  "/v1/events",
]);

function urlOf(input: RequestInfo | URL): URL | null {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    return new URL(raw, "http://houston.invalid");
  } catch {
    return null;
  }
}

async function reasonFor(res: Response): Promise<UnavailableReason> {
  try {
    return classifyUnavailableBody(await res.clone().json());
  } catch {
    return "handoff";
  }
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    let timer: ReturnType<typeof setTimeout>;
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

export function transientRetryFetch(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = urlOf(input);
    const path = url?.pathname ?? null;
    const retriable =
      (method === "GET" ||
        method === "HEAD" ||
        (method === "PUT" && path === "/v1/preferences/last_workspace_id")) &&
      !(path !== null && CALLER_OWNED_RETRY_PATHS.has(path));
    const givenUp = () => init?.signal?.aborted === true;
    let res: Response | undefined;
    let failure: unknown;
    for (let i = 0; ; i++) {
      failure = undefined;
      res = undefined;
      assertRequestIdentity(init);
      try {
        res = await inner(input, init);
      } catch (err) {
        failure = err;
      }
      if (
        res &&
        TRANSIENT_STATUSES.has(res.status) &&
        url?.searchParams.get("as") === "pdf"
      ) {
        const text = await res.clone().text();
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
        if (parseFilePreviewRefusal(body)) break;
      }
      const transient = res === undefined || TRANSIENT_STATUSES.has(res.status);
      if (!transient || !retriable || givenUp()) break;
      const delays = retryDelaysFor(res ? await reasonFor(res) : "handoff");
      if (i >= delays.length) break;
      await sleep(delays[i], init?.signal);
      if (givenUp()) break;
    }
    if (res === undefined) throw failure;
    return res;
  };
}
