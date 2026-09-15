import type { ApprovalStore } from "../assistant/approvals";
import type { AssistantCatalog } from "../assistant/catalog";
import type { WorkspacePaths } from "../paths";
import type { CredentialVault, WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import type { AssistantGateway } from "./assistant-forward";

/**
 * WHAT the runtime-facing assistant surface (`./assistant-sandbox.ts`) is built
 * from: the stores it reads, the seams tests inject, and the two facts about
 * the deployment that decide what it may perform at all.
 *
 * Held apart from the handler because `local/host.ts` assembles this contract
 * at boot while the handler only consumes it, and because the contract is what
 * the other half of the host (`control-plane-deps.ts`) restates a slice of.
 */
export interface AssistantSandboxDeps {
  vault: CredentialVault;
  /**
   * The agents an operation's parameters may name. Identifiers are never
   * guessed: a reference the caller wrote ("Dobby", "Personal/Dobby", an id) is
   * resolved against what actually exists for the sandbox's own workspace
   * before any request is built (`assistant/entity-resolution.ts`).
   */
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  /** Injection point for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Where operations are performed. `local/host.ts` sets it from the ONE
   * resolver (`assistant-wiring.ts`), which is also what the default in the
   * handler calls — a server built without this seam still reads the configured
   * env pair, and nothing else.
   */
  assistantGateway?: () => AssistantGateway | null;
  /** Injection point for tests; production reads the embedded catalog once. */
  assistantCatalog?: () => AssistantCatalog | null;
  /**
   * Operations this deployment cannot perform, from the host's own route table
   * (`assistant/served-operations.ts`). `local/host-runtime.ts` computes it once
   * at boot and passes it here; absent means nothing is withheld, which is the
   * honest answer behind a real gateway and the fail-open answer everywhere
   * else.
   */
  unservedOperations?: () => ReadonlySet<string>;
  /**
   * True only when a trusted gateway fronts EVERY request to this host (the
   * managed cloud pod), where one pod holds one agent — see `assistant-claim.ts`.
   */
  gatewayFronted?: boolean;
  /** Injection point for tests; production shares one per-process store. */
  approvals?: ApprovalStore;
}
