import { CodeVmClosedError, type TurnCodeVm } from "../code-vm/turn-code-vm";
import { type RunRequest, RunRequestError } from "../code-vm/types";

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status });

/**
 * `run_code` for a worker in `vm` mode: the call runs in this turn's own
 * micro-VM and answers with the Cloud Run sandbox's response shape, so the
 * tool upstream cannot tell which executor served it. The gateway relay is
 * not involved; the turn grant's `code-run` scope still decides whether the
 * route exists at all (turn-sandbox.ts).
 */
export function makeTurnVmCodeRoute(vm: TurnCodeVm) {
  return async (
    body: string,
    signal?: AbortSignal | null,
  ): Promise<Response> => {
    let request: RunRequest;
    try {
      request = JSON.parse(body) as RunRequest;
    } catch {
      return json(400, { error: "invalid JSON body" });
    }
    if (!request || typeof request !== "object")
      return json(400, { error: "invalid JSON body" });
    const turn = signal ?? new AbortController().signal;
    try {
      return json(200, await vm.run(request, turn));
    } catch (error) {
      if (turn.aborted) throw turn.reason ?? error;
      if (error instanceof RunRequestError)
        return json(400, { error: error.message });
      if (error instanceof CodeVmClosedError)
        return json(410, { error: error.message });
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : typeof error;
      console.error(`[code-vm] run failed (${detail})`);
      return json(502, { error: "the code VM failed" });
    }
  };
}
