import type { TurnServerDeps } from "./server-types";
import { publish } from "./turn-activity-doc";
import type { TurnSandboxViews } from "./turn-sandbox";
import { poolIdentity } from "./turn-store";
import type { TurnRequest } from "./types";

type TurnViewFamily = "skills" | "custom_definitions";

/** Publish mutation-derived views so claimed turns update asleep reads. */
export async function publishTurnSandboxViews(
  deps: TurnServerDeps,
  turn: TurnRequest & { turnId: string },
  views: TurnSandboxViews | undefined,
): Promise<TurnViewFamily[]> {
  if (!views || turn.shadow || !turn.claim || !turn.hostToken) return [];
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (!baseUrl) return [];
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  const documents: Array<{ family: TurnViewFamily; doc: unknown }> = [];
  if (views.skills !== undefined) {
    documents.push({ family: "skills", doc: views.skills });
  }
  if (views.customDefinitions !== undefined) {
    documents.push({
      family: "custom_definitions",
      doc: views.customDefinitions,
    });
  }
  const failures: Array<{ family: TurnViewFamily; error: string }> = [];
  for (const { family, doc } of documents) {
    try {
      const result = await publish(
        {
          family,
          baseUrl,
          org,
          agent,
          conversationId: turn.conversationId,
          hostToken: turn.hostToken,
          claim: { token: turn.claim.token, bootId: turn.claim.bootId },
          fetchImpl: deps.fetchImpl ?? fetch,
          ...(deps.activityDocRetryDelaysMs
            ? { retryDelaysMs: deps.activityDocRetryDelaysMs }
            : {}),
        },
        doc,
      );
      if ("error" in result) failures.push({ family, error: result.error });
      if ("disabled" in result) {
        failures.push({ family, error: result.reason });
      }
    } catch (error) {
      failures.push({
        family,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const failure of failures) {
    console.error(
      `[turn] ${failure.family} view publish failed after durable sync: ${failure.error}`,
    );
  }
  return failures.map((failure) => failure.family);
}
