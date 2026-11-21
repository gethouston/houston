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

export interface Acknowledgement {
  name: string;
  kind: AcknowledgementKind;
  reason: string;
  debt: boolean;
}

export interface OperationAnnotation {
  name: string;
  location: string;
  documented: boolean;
  group?: string;
  hidden: boolean;
  hiddenReason?: string;
  handsCard?: string;
  method?: HttpMethod;
  confirm: boolean;
  confirmed?: string;
  unconfirmed?: string;
  openIdentifiers: string[];
  unroutableReason?: string;
  unschematizedReason?: string;
  routeConflict?: { route: string; others: string[] };
  unknownTags: string[];
  routable: boolean;
  unschematizedFields: string[];
}

export type AssistantCatalog = AssistantCatalogDocument;

export interface Coverage {
  undocumented: string[];
  ungrouped: string[];
  misgrouped: string[];
  unschematized: string[];
  hidden: string[];
  unroutable: UnroutableOperation[];
}

export interface ExtractionResult {
  catalog: AssistantCatalog;
  coverage: Coverage;
  annotations: OperationAnnotation[];
}

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
  "channels",
  "api-keys",
  "store",
  "attachments",
  "settings",
  "system",
];
