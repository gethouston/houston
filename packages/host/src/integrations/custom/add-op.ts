import { type AddCustomIntegrationInput, defFromAddInput } from "./add-input";
import type { CustomOAuthDeps } from "./oauth-ops";
import { sameServiceOrigins } from "./service-origins";
import { slugify } from "./slug";
import {
  CUSTOM_SLUG,
  CustomIntegrationError,
  type CustomIntegrationView,
} from "./types";
import { viewOf } from "./views";

export async function addCustomIntegration(
  deps: CustomOAuthDeps,
  input: AddCustomIntegrationInput,
): Promise<CustomIntegrationView> {
  const slug = input.slug ?? slugify(input.name);
  if (!CUSTOM_SLUG.test(slug)) {
    throw new CustomIntegrationError("invalid_slug", `invalid slug '${slug}'`);
  }
  if (input.auth === "oauth" && deps.callbackUrl === undefined) {
    throw new CustomIntegrationError(
      "oauth_unsupported",
      "signing in with this service is not available on this Houston deployment yet",
    );
  }
  if (slug === "executor") {
    throw new CustomIntegrationError(
      "invalid_slug",
      "'executor' is a reserved name; pick another",
    );
  }
  const defs = await deps.store.list();
  const existing = defs.find((d) => d.slug === slug);
  if (existing && !input.replace) {
    throw new CustomIntegrationError(
      "duplicate_slug",
      `a custom integration named '${slug}' already exists`,
    );
  }
  if (existing && existing.kind !== input.kind) {
    throw new CustomIntegrationError(
      "duplicate_slug",
      `'${slug}' already exists as a different kind; remove it first`,
    );
  }
  let def = defFromAddInput(input, slug);
  if (existing) {
    const keepCredential =
      existing.credential !== undefined && sameServiceOrigins(existing, def);
    def = {
      ...def,
      addedAtMs: existing.addedAtMs,
      ...(keepCredential
        ? { auth: existing.auth, credential: existing.credential }
        : {}),
    };
  }
  const { executor, states } = await deps.host.ensure();
  if (existing) await deps.host.uncompileDef(executor, existing);
  const state = await deps.host.compileDef(executor, def);
  if (state.status === "error") {
    await deps.host.uncompileDef(executor, def);
    if (existing) {
      states.set(slug, await deps.host.compileDef(executor, existing));
    }
    throw new CustomIntegrationError("compile_failed", state.message);
  }
  for (const id of Object.values(existing?.credential?.secretIds ?? {})) {
    if (!Object.values(def.credential?.secretIds ?? {}).includes(id)) {
      await deps.secrets.delete(id);
    }
  }
  await deps.store.put(def);
  states.set(slug, state);
  deps.onChanged(slug);
  return viewOf(
    def,
    state,
    await deps.host.authMethods(executor, slug).catch(() => []),
  );
}
