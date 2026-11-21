import { type ControlPlaneConfig, cpFetch } from "./fetch";

export const prefPath = (key: string) =>
  `/v1/preferences/${encodeURIComponent(key)}`;

/**
 * Reads one of the user's saved preferences.
 * @assistant group:settings hidden: UI plumbing; an untyped key/value store the app reads for its own device settings.
 */
export async function getPreference(
  cfg: ControlPlaneConfig,
  key: string,
): Promise<string | null> {
  const res = await cpFetch(cfg, prefPath(key));
  return ((await res.json()) as { value: string | null }).value;
}
/**
 * Changes one of the user's saved preferences.
 * @assistant group:settings hidden: UI plumbing; an open key/value write that can clobber any app setting.
 */
export async function setPreference(
  cfg: ControlPlaneConfig,
  key: string,
  value: string,
): Promise<void> {
  await cpFetch(cfg, prefPath(key), {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}
