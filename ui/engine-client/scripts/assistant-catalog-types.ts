import type {
  AssistantCatalogDocument,
  AssistantFieldDocument as AssistantFieldDocumentType,
  AssistantHttpMethod,
  AssistantJsonSchema,
  AssistantOperationDocument,
  AssistantParameterDocument,
  AssistantPathEncoding,
  AssistantPathParam as AssistantPathParamDocument,
  AssistantRouteDocument,
} from "@houston/domain";

/**
 * What the generator writes, and what the coverage gate judges.
 *
 * The DOCUMENT shapes are not declared here: they are the single declaration in
 * `@houston/domain`, which the host reads the same file back through. A second
 * copy on the writer's side would drift, and the drift would only ever surface
 * as a catalog the host silently refuses to load. The aliases below are that
 * one declaration under the names this generator has always used.
 *
 * Everything after them is generator-only: the coverage gate's view of an
 * operation, which is deliberately absent from the emitted document.
 */

export type JsonSchema = AssistantJsonSchema;
export type HttpMethod = AssistantHttpMethod;
export type PathEncoding = AssistantPathEncoding;
export type AssistantPathParam = AssistantPathParamDocument;
export type AssistantParameter = AssistantParameterDocument;
export type AssistantFieldDocument = AssistantFieldDocumentType;
export type AssistantRoute = AssistantRouteDocument;
export type AssistantOperation = AssistantOperationDocument;

export interface UnroutableOperation {
  name: string;
  reason: string;
}

export type AcknowledgementKind =
  | "hidden"
  | "unroutable"
  | "unschematized"
  | "unconfirmed";

/** One human-owned exception: the author states why automation stops here. */
export interface Acknowledgement {
  name: string;
  kind: AcknowledgementKind;
  /** The author's reason, with the `debt:` marker stripped. */
  reason: string;
  /** The reason says the operation SHOULD be automatable and needs work. */
  debt: boolean;
}

/**
 * Everything the coverage gate judges one operation on. Deliberately absent
 * from the generated catalog: `location` moves with every edit above the
 * declaration, and committing it would make the drift check fire on line
 * shifts that change nothing about the surface.
 */
export interface OperationAnnotation {
  name: string;
  /** Repo-relative `file:line` of the declaration. */
  location: string;
  documented: boolean;
  /** The declared group, `undefined` when none was declared. */
  group?: string;
  hidden: boolean;
  hiddenReason?: string;
  method?: HttpMethod;
  confirm: boolean;
  unconfirmed?: string;
  /** Parameters that address an existing thing with nothing behind them. */
  openIdentifiers: string[];
  unroutableReason?: string;
  unschematizedReason?: string;
  unknownTags: string[];
  routable: boolean;
  /** `param` / `returns` names whose schema fell back to free-form. */
  unschematizedFields: string[];
}

export type AssistantCatalog = AssistantCatalogDocument;

export interface Coverage {
  undocumented: string[];
  ungrouped: string[];
  /** Operations whose `group` is outside the fixed taxonomy. */
  misgrouped: string[];
  unschematized: string[];
  hidden: string[];
  unroutable: UnroutableOperation[];
}

export interface ExtractionResult {
  catalog: AssistantCatalog;
  coverage: Coverage;
  /** Per-operation input to the coverage gate, in catalog order. */
  annotations: OperationAnnotation[];
}

/**
 * The closed set of groups an operation may declare. A group outside it is a
 * typo or an invented taxonomy, and the coverage report fails it.
 */
export const ASSISTANT_GROUPS: readonly string[] = [
  "workspaces",
  "agents",
  "files",
  "missions",
  "chat",
  "routines",
  "skills",
  "integrations",
  "providers",
  "org",
  "teams",
  "spaces",
  "billing",
  "api-keys",
  "store",
  "attachments",
  "settings",
  "system",
];
