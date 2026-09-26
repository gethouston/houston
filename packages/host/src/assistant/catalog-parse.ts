import { ASSISTANT_HANDS_TOOLS } from "@houston/domain/assistant-hands";
import { HANDS_ON_SURFACES } from "@houston/protocol";
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

/** The live lists the host can resolve a value against (AssistantEntityCollection). */
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

/**
 * The card that reaches a hidden operation, or the author's statement that none
 * does. A real union, not a loose object: the two arms carry different fields,
 * and a document that half-spells one would have the host promise the person a
 * screen with no name to open.
 *
 * Both lists are READ from their declarations rather than retyped: the cards
 * are `@houston/domain`'s, the screens are `@houston/protocol`'s, and the
 * generator writes documents against those same two. A copy here would refuse
 * every document carrying a card or a screen added over there — which reads as
 * the assistant family switching itself off after a regeneration.
 */
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
      // Additive and optional, so a build reading an older catalog (which
      // carries no `hands` at all) loads it unchanged rather than refusing the
      // whole document and switching the assistant family off.
      hands: Type.Optional(HandsEnvelope),
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
          resolver: Type.Optional(EntityCollection),
          unresolved: Type.Optional(Type.String()),
          // Identifiers one level inside a body object. Optional (most
          // parameters carry none) and checked when present, because the host
          // RESOLVES what it finds here against the user's live lists.
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
