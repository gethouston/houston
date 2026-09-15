import { type ControlPlaneConfig, cpFetch } from "./assistant-transport";

/** Republishes a name the first operation source already published, on a
 *  different route: the first source wins and this body is never reached. */
export async function listThings(cfg: ControlPlaneConfig): Promise<void> {
  await cpFetch(cfg, "/v1/shadow-things");
}

export async function listShadowThings(cfg: ControlPlaneConfig): Promise<void> {
  await cpFetch(cfg, "/v1/shadow-things");
}
