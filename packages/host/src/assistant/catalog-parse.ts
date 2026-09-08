import { Type } from "typebox";
import { Value } from "typebox/value";
import {
  ASSISTANT_CATALOG_VERSION,
  type AssistantCatalog,
} from "./catalog-types";

/**
 * The shape check one catalog document passes before anything dispatches over
 * it. A document that fails is never an exception: the caller turns `null` into
 * "the assistant family is off", never a crashed boot.
 */

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
  // Descriptive only; checked when present so the parsed type never claims a
  // boolean that is really a string, never required (see AssistantRouteDocument).
  rawResponse: Type.Optional(Type.Boolean()),
});

/**
 * The envelope shape, checked field for field against the document
 * `@houston/domain` declares. Per-param `schema` / `returns` stay `Unknown` on
 * purpose: they are arbitrary JSON Schema, so the only meaningful check is the
 * one `Value.Check` performs later against a concrete argument.
 */
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
      params: Type.Array(
        Type.Object({
          name: Type.String(),
          required: Type.Boolean(),
          schema: Type.Unknown(),
          // The two guessing-killers `houston_describe` renders. Optional (a
          // parameter needs neither) but checked when present, because the
          // parsed type claims they are strings and the describe tool prints
          // them verbatim to the model.
          description: Type.Optional(Type.String()),
          source: Type.Optional(Type.String()),
          resolver: Type.Optional(
            Type.Union([
              Type.Literal("agents"),
              Type.Literal("teams"),
              Type.Literal("workspaces"),
              Type.Literal("members"),
              Type.Literal("invites"),
              Type.Literal("routines"),
              Type.Literal("skills"),
              Type.Literal("shared-skills"),
              Type.Literal("activities"),
            ]),
          ),
          unresolved: Type.Optional(Type.String()),
        }),
      ),
      returns: Type.Unknown(),
      route: Type.Union([RouteEnvelope, Type.Null()]),
    }),
  ),
});

/**
 * Parse + shape-check one catalog document. Returns null (never throws) for
 * unreadable JSON, a wrong shape, or a version this build does not read — the
 * caller turns that into "the assistant family is off", never a crash.
 */
export function parseAssistantCatalog(raw: string): AssistantCatalog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Value.Check(CatalogEnvelope, parsed)) return null;
  // SAFETY: the envelope check above pins every field the document declares;
  // it only widens the two arbitrary-JSON-Schema fields to TSchema.
  const catalog = parsed as unknown as AssistantCatalog;
  return catalog.version === ASSISTANT_CATALOG_VERSION ? catalog : null;
}
