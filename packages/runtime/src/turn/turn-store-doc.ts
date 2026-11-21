import type {
  ActivityDocOptions,
  ActivityDocPublishResult,
} from "./turn-activity-doc";
import type { ActivityDocSource } from "./turn-activity-source";
import { publishDerived } from "./turn-doc-merge-publish";
import { readStoreText } from "./turn-store-read";

export async function publishStoreDoc(
  target: ActivityDocOptions,
  source: ActivityDocSource,
  rel: string,
  project: (raw: string | null) => unknown,
): Promise<ActivityDocPublishResult> {
  try {
    return await publishDerived(target, async () =>
      project(await readStoreText(source, rel)),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
