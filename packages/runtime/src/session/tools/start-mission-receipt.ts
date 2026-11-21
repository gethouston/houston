export interface StartedMissionReceipt {
  id: string;
  title: string;
  agent: string;
}

export function startedMissionFromDetails(
  details: unknown,
): StartedMissionReceipt | undefined {
  if (!details || typeof details !== "object") return;
  const receipt = details as {
    ok?: unknown;
    id?: unknown;
    title?: unknown;
    agent?: unknown;
  };
  if (
    receipt.ok !== true ||
    typeof receipt.id !== "string" ||
    typeof receipt.title !== "string" ||
    typeof receipt.agent !== "string"
  )
    return;
  return { id: receipt.id, title: receipt.title, agent: receipt.agent };
}

export function startedMissionFromMcpResult(
  result: unknown,
): StartedMissionReceipt | undefined {
  if (!result || typeof result !== "object") return;
  const structured = (result as { structuredContent?: unknown })
    .structuredContent;
  return startedMissionFromPayload(structured);
}

export function startedMissionFromMcpText(
  text: string,
): StartedMissionReceipt | undefined {
  if (!/^\s*\{\s*"mission"\s*:/.test(text)) return;
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return;
  }
  return startedMissionFromPayload(payload);
}

function startedMissionFromPayload(
  payload: unknown,
): StartedMissionReceipt | undefined {
  if (!payload || typeof payload !== "object") return;
  const mission = (payload as { mission?: unknown }).mission;
  if (!mission || typeof mission !== "object") return;
  const receipt = mission as { id?: unknown; title?: unknown; agent?: unknown };
  if (
    typeof receipt.id !== "string" ||
    typeof receipt.title !== "string" ||
    typeof receipt.agent !== "string"
  )
    return;
  return { id: receipt.id, title: receipt.title, agent: receipt.agent };
}
