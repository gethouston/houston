import type { RemoteMissionRoute } from "./missions-remote";
import { missionPath, remoteHeaders } from "./missions-remote-forward";

export type RemoteMissionStatus = "running" | "settled" | "unknown";

export async function readRemoteMissionStatus(
  route: RemoteMissionRoute,
  missionId: string,
): Promise<RemoteMissionStatus> {
  const url = new URL(missionPath(route, "/read"));
  url.searchParams.set("id", missionId);
  const response = await (route.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers: remoteHeaders(route),
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 403 || response.status === 404) return "unknown";
  if (!response.ok) throw new Error(`remote board returned ${response.status}`);
  const payload: unknown = await response.json();
  const row = payload as { id?: unknown; status?: unknown } | null;
  if (row?.id !== missionId) return "unknown";
  if (row.status === undefined) return "unknown";
  if (row.status === "running") return "running";
  if (["needs_you", "done", "error", "archived"].includes(String(row.status)))
    return "settled";
  throw new Error("remote mission returned an unknown status");
}
