import { type CustomIntegrationDef, CustomIntegrationError } from "./types";

/** Cosmetic edits never replace the connection or its stable tool/credential IDs. */
export function editDetails(
  def: CustomIntegrationDef,
  input: unknown,
): CustomIntegrationDef {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CustomIntegrationError(
      "invalid_details",
      "invalid integration details",
    );
  }
  const body = input as Record<string, unknown>;
  if (
    Object.keys(body).some((key) => key !== "name" && key !== "website") ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 120 ||
    typeof body.website !== "string"
  ) {
    throw new CustomIntegrationError(
      "invalid_details",
      "name and website are required; name must be 1-120 characters",
    );
  }
  let website = body.website.trim();
  if (website) {
    try {
      const url = new URL(website);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("invalid website");
      website = url.href;
    } catch {
      throw new CustomIntegrationError(
        "invalid_details",
        "website must be an HTTP or HTTPS URL without credentials",
      );
    }
  }
  const updated = { ...def, name: body.name.trim() };
  if (website) updated.website = website;
  else delete updated.website;
  return updated;
}
