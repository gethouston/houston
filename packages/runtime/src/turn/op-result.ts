import type { HoustonEvent } from "@houston/protocol";
import type { CapturedCustomDefinitions } from "./turn-custom-definitions-doc";

export interface OpResult {
  /** A remote secret write preceded the tree sync. */
  durableElsewhere?: boolean;
  ambiguous?: boolean;
  status: number;
  contentType: string;
  body: string;
  /** Binary answer (file download / archive), base64 — relayed raw. */
  bodyBase64?: string;
  /** Response headers the client depends on (Content-Disposition, ...). */
  headers?: Record<string, string>;
  events: HoustonEvent[];
  /** Store-relative paths this op may have written (the sync-back scope). */
  include: (relativePath: string) => boolean;
  /** The pod's own /skills answer after a skills mutation (the skills view). */
  skillsView?: unknown;
  /** The definitions capture after a custom-integration mutation. */
  customDefinitions?: CapturedCustomDefinitions;
  /** The hydrated tree had no such agent — decline, do not relay. */
  agentMissing?: boolean;
  /** The worker cannot serve this one (a provider that needs the pod). */
  decline?: boolean;
  /** A lazy read was refused mid-handler: the overlay may be partial. */
  tooLarge?: true;
  /** A lazy read of sign-in state was refused (its private directory is not
   *  this process's own): the overlay may be partial, as with `tooLarge`. */
  privateRefused?: true;
  untouched?: true;
}
