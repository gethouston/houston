import type { AssistantHands } from "./assistant-hands";

export type AssistantEntityCollection =
  | "agents"
  | "workspaces"
  | "members"
  | "invites"
  | "routines"
  | "skills"
  | "shared-skills"
  | "activities";

export type AssistantJsonSchema = Record<string, unknown>;

export const ASSISTANT_CATALOG_VERSION = 3;

export type AssistantHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type AssistantPathEncoding = "segment" | "path";

export interface AssistantPathParam {
  name: string;
  encoding: AssistantPathEncoding;
}

export interface AssistantRouteDocument {
  method: AssistantHttpMethod;
  path: string;
  pathParams: AssistantPathParam[];
  query: Record<string, string>;
  body: string | null;
  bodyFields: Record<string, string> | null;
  rawResponse?: boolean;
}

export interface AssistantParameterDocument<Schema = AssistantJsonSchema> {
  name: string;
  required: boolean;
  schema: Schema;
  description?: string;
  source?: string;
  resolver?: AssistantEntityCollection;
  unresolved?: string;
  fields?: AssistantFieldDocument[];
}

export interface AssistantFieldDocument {
  name: string;
  source?: string;
  resolver?: AssistantEntityCollection;
  unresolved?: string;
}

export interface AssistantOperationDocument<Schema = AssistantJsonSchema> {
  name: string;
  group: string;
  description: string;
  confirm: boolean;
  hidden: boolean;
  hiddenReason?: string;
  unconfirmed?: string;
  hands?: AssistantHands;
  params: AssistantParameterDocument<Schema>[];
  returns: Schema;
  route: AssistantRouteDocument | null;
}

export interface AssistantCatalogDocument<Schema = AssistantJsonSchema> {
  $comment?: string;
  version: number;
  sourceHash: string;
  operations: AssistantOperationDocument<Schema>[];
}
