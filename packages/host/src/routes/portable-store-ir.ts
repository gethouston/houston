import {
  type AgentIR,
  type AgentProvenance,
  parseSkillFrontmatter,
} from "@houston/agentstore-contract";
import { applyOverrides, irFromPortable } from "@houston/domain";
import type {
  PortableExportOverrides,
  PortableSelection,
} from "@houston/protocol";
import type { AgentId, UserId } from "../domain/types";
import type { LocalIntegrationGrants } from "../integrations/grants";
import type { Vfs } from "../vfs";
import { gatherPortableContent } from "./portable-content";

/** Bumped independently of the wire protocol; stamped into IR provenance. */
const HOUSTON_VERSION = "0.0.0";

/** The listing identity the publish wizard collects. */
export interface StoreIrIdentity {
  name: string;
  description: string;
  tagline?: string;
  category: string;
  tags: string[];
}

/**
 * The store-ir request body, once validated. This is a CONTENT request only:
 * the host gathers the selected agent content and maps it to an AgentIR. It
 * performs no network I/O and holds no store credentials — the app POSTs the
 * returned IR to the gateway with the user's own bearer.
 */
export interface StoreIrRequest {
  selection: PortableSelection;
  overrides?: PortableExportOverrides;
  identity: StoreIrIdentity;
  creator: { displayName: string; url?: string };
  anonymized: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const stringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Validate untrusted wizard input into a `StoreIrRequest`, or return an error
 * string. `identity.description` is required (never defaulted). The selection is
 * normalized defensively — unknown ids simply don't match at gather time.
 */
export function parseStoreIrRequest(
  body: Record<string, unknown>,
): StoreIrRequest | string {
  const { identity, creator, selection } = body;
  if (!isRecord(identity)) return "missing 'identity'";
  if (!isNonEmptyString(identity.name)) return "missing 'identity.name'";
  if (!isNonEmptyString(identity.description))
    return "missing 'identity.description'";
  if (!isNonEmptyString(identity.category))
    return "missing 'identity.category'";
  if (!isRecord(creator) || !isNonEmptyString(creator.displayName))
    return "missing 'creator.displayName'";
  if (!isRecord(selection)) return "missing 'selection'";

  return {
    selection: {
      includeClaudeMd: Boolean(selection.includeClaudeMd),
      skillSlugs: stringArray(selection.skillSlugs),
      routineIds: stringArray(selection.routineIds),
      learningIds: stringArray(selection.learningIds),
    },
    overrides: isRecord(body.overrides)
      ? (body.overrides as unknown as PortableExportOverrides)
      : undefined,
    identity: {
      name: identity.name.trim(),
      description: identity.description,
      ...(isNonEmptyString(identity.tagline)
        ? { tagline: identity.tagline.trim() }
        : {}),
      category: identity.category.trim(),
      tags: stringArray(identity.tags),
    },
    creator: {
      displayName: creator.displayName.trim(),
      ...(isNonEmptyString(creator.url) ? { url: creator.url.trim() } : {}),
    },
    anonymized: Boolean(body.anonymized),
  };
}

/** Union of the agent's local grant toolkits and each skill's frontmatter integrations. */
async function collectIntegrations(
  grants: LocalIntegrationGrants | undefined,
  agentId: AgentId,
  userId: UserId,
  skills: { body: string }[],
): Promise<string[]> {
  const out = new Set<string>();
  if (grants) for (const t of await grants.read(agentId, userId)) out.add(t);
  for (const skill of skills)
    for (const i of parseSkillFrontmatter(skill.body).integrations) out.add(i);
  return [...out];
}

/** Gather the selected content, apply anonymize overrides, and assemble the IR. */
export async function buildStoreIr(
  vfs: Vfs,
  grants: LocalIntegrationGrants | undefined,
  root: string,
  agentId: AgentId,
  userId: UserId,
  request: StoreIrRequest,
): Promise<AgentIR> {
  const content = applyOverrides(
    await gatherPortableContent(vfs, root, request.selection),
    request.overrides,
  );
  const integrations = await collectIntegrations(
    grants,
    agentId,
    userId,
    content.skills,
  );
  const provenance: AgentProvenance = {
    createdVia: "houston",
    exporter: "houston-app",
    houstonVersion: HOUSTON_VERSION,
    anonymized: request.anonymized,
  };
  return irFromPortable(content, {
    identity: request.identity,
    creator: request.creator,
    integrations,
    provenance,
  });
}
