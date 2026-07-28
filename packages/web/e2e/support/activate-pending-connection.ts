import { FAKE_HOST_URL } from "@houston/fake-host";
import { type APIRequestContext, expect } from "@playwright/test";

/** Complete a fake-host OAuth hand-off once its pending connection exists. */
export async function activatePendingConnection(
  request: APIRequestContext,
  toolkit: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${FAKE_HOST_URL}/v1/integrations/composio/connections`,
        );
        const { items } = (await response.json()) as {
          items: { toolkit: string; connectionId: string; status: string }[];
        };
        const pending = items.find(
          (connection) =>
            connection.toolkit === toolkit && connection.status === "pending",
        );
        if (!pending) return false;
        await request.post(`${FAKE_HOST_URL}/__test__/integrations-activate`, {
          data: { connectionId: pending.connectionId },
        });
        return true;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}
