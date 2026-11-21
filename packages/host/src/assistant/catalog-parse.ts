import { ASSISTANT_HANDS_TOOLS } from "@houston/domain/assistant-hands";
import { HANDS_ON_SURFACES } from "@houston/protocol";
import { Type } from "typebox";
import { Value } from "typebox/value";
import {
  ASSISTANT_CATALOG_VERSION,
  type AssistantCatalog,
} from "./catalog-types";

const RouteEnvelope = Type.Object({
  method: Type.Union([
    Type.Literal("GET"),
    Type.Literal("POST"),
    Type.Literal("PATCH"),
    Type.Literal("PUT"),
    Type.Literal("DELETE"),
  ]),
  path: Type.String(),
  pathParams: Type.Array(
    Type.Object({
      name: Type.String(),
      encoding: Type.Union([Type.Literal("segment"), Type.Literal("path")]),
    }),
  ),
  query: Type.Record(Type.String(), Type.String()),
  body: Type.Union([Type.String(), Type.Null()]),
  bodyFields: Type.Union([
    Type.Record(Type.String(), Type.String()),
    Type.Null(),
  ]),
  rawResponse: Type.Optional(Type.Boolean()),
});

const EntityCollection = Type.Union([
  Type.Literal("agents"),
  Type.Literal("workspaces"),
  Type.Literal("members"),
  Type.Literal("invites"),
  Type.Literal("routines"),
  Type.Literal("skills"),
  Type.Literal("shared-skills"),
  Type.Literal("activities"),
]);

const HandsEnvelope = Type.Union([
  Type.Object({
    kind: Type.Literal("card"),
    tool: Type.Union(ASSISTANT_HANDS_TOOLS.map((tool) => Type.Literal(tool))),
    surface: Type.Optional(
      Type.Union(HANDS_ON_SURFACES.map((surface) => Type.Literal(surface))),
    ),
  }),
  Type.Object({ kind: Type.Literal("unreachable"), reason: Type.String() }),
]);

const CatalogEnvelope = Type.Object({
  version: Type.Number(),
  sourceHash: Type.String(),
  operations: Type.Array(
    Type.Object({
      name: Type.String(),
      group: Type.String(),
      description: Type.String(),
      confirm: Type.Boolean(),
      hidden: Type.Boolean(),
      hiddenReason: Type.Optional(Type.String()),
      unconfirmed: Type.Optional(Type.String()),
      hands: Type.Optional(HandsEnvelope),
      params: Type.Array(
        Type.Object({
          name: Type.String(),
          required: Type.Boolean(),
          schema: Type.Unknown(),
          description: Type.Optional(Type.String()),
          source: Type.Optional(Type.String()),
          resolver: Type.Optional(EntityCollection),
          unresolved: Type.Optional(Type.String()),
          fields: Type.Optional(
            Type.Array(
              Type.Object({
                name: Type.String(),
                source: Type.Optional(Type.String()),
                resolver: Type.Optional(EntityCollection),
                unresolved: Type.Optional(Type.String()),
              }),
            ),
          ),
        }),
      ),
      returns: Type.Unknown(),
      route: Type.Union([RouteEnvelope, Type.Null()]),
    }),
  ),
});

export function parseAssistantCatalog(raw: string): AssistantCatalog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Value.Check(CatalogEnvelope, parsed)) return null;
  const catalog = parsed as unknown as AssistantCatalog;
  return catalog.version === ASSISTANT_CATALOG_VERSION ? catalog : null;
}
