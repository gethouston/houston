import type { SecretRedaction } from "@houston/domain";
import { lintSource } from "@secretlint/core";
import { creator as recommendPreset } from "@secretlint/secretlint-rule-preset-recommend";

/**
 * The host's `SecretRedactor` (see `@houston/domain` anonymize.ts): scrub
 * credentials out of a text before it rides the anonymize pass. Backed by
 * secretlint's recommended preset — AWS, GCP, GitHub, GitLab, Slack, Stripe,
 * OpenAI, Anthropic, private keys, database connection strings, and more —
 * so the pattern knowledge is maintained upstream, not hand-rolled here.
 *
 * Lives in the host (node-only): the preset bundle imports `node:path`, so
 * it must never enter the browser-shared `@houston/domain` package.
 */

const CONFIG = {
  rules: [
    {
      id: "@secretlint/secretlint-rule-preset-recommend",
      rule: recommendPreset,
      rules: [
        {
          // The bare access-key-id scan (AKIA…) is off by default upstream
          // (false-positive averse). Here a false positive is a reviewable
          // side-by-side diff while a miss is a leaked credential — enable it.
          id: "@secretlint/secretlint-rule-aws",
          options: { enableIDScanRule: true },
        },
      ],
    },
  ],
};

/** Replace every detected credential with `<secret>` and count them. */
export async function redactSecrets(text: string): Promise<SecretRedaction> {
  const result = await lintSource({
    source: {
      content: text,
      filePath: "portable-anonymize.md",
      ext: ".md",
      contentType: "text",
    },
    options: { locale: "en", maskSecrets: false, config: CONFIG },
  });

  // Merge overlapping ranges (several rules can flag one span), then replace
  // from the end so earlier offsets stay valid.
  const ranges = result.messages
    .map((m) => m.range)
    .filter((r): r is [number, number] => Array.isArray(r) && r.length === 2)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  let out = text;
  for (const [start, end] of merged.reverse()) {
    out = `${out.slice(0, start)}<secret>${out.slice(end)}`;
  }
  return { text: out, count: merged.length };
}
