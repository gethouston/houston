import type {
  AssistantCatalogDocument,
  AssistantOperationDocument,
  AssistantParameterDocument,
} from "@houston/domain";
import type { TSchema } from "typebox";

export {
  ASSISTANT_CATALOG_VERSION,
  type AssistantHttpMethod,
  type AssistantPathEncoding,
  type AssistantPathParam,
  type AssistantRouteDocument as AssistantRoute,
} from "@houston/domain";
export type { AssistantHands } from "@houston/domain/assistant-hands";

export type AssistantOperationParam = AssistantParameterDocument<TSchema>;
export type AssistantOperation = AssistantOperationDocument<TSchema>;
export type AssistantCatalog = AssistantCatalogDocument<TSchema>;
