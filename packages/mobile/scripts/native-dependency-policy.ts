// The native apps link no Facebook SDK and no analytics or ad-measurement SDK.
// App Store privacy labels, App Tracking Transparency and Play data-safety
// answers depend on their absence. FirebaseCore and Firebase Messaging still
// carry Google's analytics interop interfaces (FIRAnalyticsInterop on iOS,
// firebase-measurement-connector on Android); those are not measurement SDKs.
const BANNED_SWIFT_PRODUCT =
  /^(Facebook|FBSDK|FBAEM)|Analytics|AppMeasurement|OnDeviceConversion|MobileAds/;
const BANNED_SWIFT_PACKAGE = /facebook/i;
const BANNED_ANDROID_ARTIFACT =
  /^com\.facebook\.|:firebase-analytics|:play-services-(measurement|ads)/;
const DEFAULT_TRAITS = /^\.?defaults?$/i;

export type SwiftProduct = {
  name: string;
  package: string;
  /** Traits that include the product; null when it is unconditional. */
  traits: string[] | null;
};

function quoted(list: string): string[] {
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

export function swiftPackageName(manifest: string): string {
  const name = /Package\(\s*name:\s*"([^"]+)"/.exec(manifest)?.[1];
  if (!name) throw new Error("Package.swift declares no package name");
  return name;
}

export function swiftProducts(manifest: string): SwiftProduct[] {
  const product =
    /\.product\(\s*name:\s*"([^"]+)",\s*package:\s*"([^"]+)"(?:\s*,\s*condition:\s*\.when\(\s*traits:\s*\[([^\]]*)\]\s*\))?/g;
  return [...manifest.matchAll(product)].map((match) => ({
    name: match[1],
    package: match[2],
    traits: match[3] === undefined ? null : quoted(match[3]),
  }));
}

/** Traits SwiftPM enables for a package, given the app's requested traits. */
export function enabledSwiftTraits(
  manifest: string,
  requested: readonly string[] | undefined,
): Set<string> {
  const defaults = quoted(
    /\.default\(\s*enabledTraits:\s*\[([^\]]*)\]/.exec(manifest)?.[1] ?? "",
  );
  const implied = new Map<string, string[]>();
  const declarations = manifest.split(/dependencies:/)[0];
  for (const chunk of declarations.split(".trait(").slice(1)) {
    const name = /^\s*name:\s*"([^"]+)"/.exec(chunk)?.[1];
    const enables = /enabledTraits:\s*\[([^\]]*)\]/.exec(chunk)?.[1];
    if (name) implied.set(name, enables ? quoted(enables) : []);
  }
  const pending = (requested ?? [".defaults"]).flatMap((trait) =>
    DEFAULT_TRAITS.test(trait) ? defaults : [trait],
  );
  const enabled = new Set<string>();
  for (let trait = pending.pop(); trait; trait = pending.pop()) {
    if (enabled.has(trait)) continue;
    enabled.add(trait);
    pending.push(...(implied.get(trait) ?? []));
  }
  return enabled;
}

/** Banned products a plugin's Package.swift links under the requested traits. */
export function bannedSwiftProducts(
  manifest: string,
  requested: readonly string[] | undefined,
): string[] {
  const enabled = enabledSwiftTraits(manifest, requested);
  return swiftProducts(manifest)
    .filter(
      (product) =>
        BANNED_SWIFT_PRODUCT.test(product.name) ||
        BANNED_SWIFT_PACKAGE.test(product.package),
    )
    .filter(
      (product) =>
        product.traits === null ||
        product.traits.some((trait) => enabled.has(trait)),
    )
    .map((product) => `${product.package}/${product.name}`);
}

/** The traits the generated CapApp-SPM manifest passes to one plugin package. */
export function generatedSwiftTraits(
  generated: string,
  packageName: string,
): string[] | null {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = new RegExp(
    `\\.package\\(name: "${escaped}", path: "[^"]*"(?:, traits: \\[([^\\]]*)\\])?\\)`,
  ).exec(generated);
  if (!line) return null;
  if (line[1] === undefined) return [];
  return line[1]
    .split(",")
    .map((trait) => trait.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

export function swiftToolsVersion(manifest: string): string | null {
  return /^\/\/ swift-tools-version:\s*(\S+)/.exec(manifest)?.[1] ?? null;
}

/** Package products the Xcode project links into its targets directly. */
export function xcodePackageProducts(pbxproj: string): string[] {
  const product =
    /isa = XCSwiftPackageProductDependency;[\s\S]*?productName = "?([^";]+)"?;/g;
  return [...pbxproj.matchAll(product)].map((match) => match[1]);
}

export function gradleVariables(variablesGradle: string): Map<string, string> {
  const assignment = /^\s*(\w+)\s*=\s*(.+?)\s*$/gm;
  return new Map(
    [...variablesGradle.matchAll(assignment)].map((match) => [
      match[1],
      match[2].replace(/^['"]|['"]$/g, ""),
    ]),
  );
}

type GradleBlock = { variable: string; expected: boolean } | null;

/**
 * Banned artifacts a plugin's build.gradle packages into the app. A
 * dependency inside `if (flag)` counts unless the app's variables.gradle sets
 * that flag explicitly; a flag left to the plugin's default fails closed.
 */
export function bannedGradleDependencies(
  buildGradle: string,
  variables: ReadonlyMap<string, string>,
): string[] {
  const stack: GradleBlock[] = [];
  const banned: string[] = [];
  for (const line of buildGradle.split("\n")) {
    const opened = /^\s*if\s*\(\s*(!?)(\w+)\s*\)\s*\{\s*$/.exec(line);
    if (opened) {
      stack.push({ variable: opened[2], expected: opened[1] !== "!" });
      continue;
    }
    if (/^\s*\}\s*else\s*\{\s*$/.test(line)) {
      const top = stack.at(-1);
      if (top) top.expected = !top.expected;
      continue;
    }
    const dependency =
      /^\s*(?:implementation|api|runtimeOnly)\s*\(?\s*["']([^"':]+:[^"':]+)/.exec(
        line,
      )?.[1];
    if (dependency && BANNED_ANDROID_ARTIFACT.test(dependency)) {
      const packaged = stack.every((block) => {
        if (block === null) return true;
        const value = variables.get(block.variable);
        return value === undefined || (value === "true") === block.expected;
      });
      if (packaged) banned.push(dependency);
    }
    for (const char of line) {
      if (char === "{") stack.push(null);
      if (char === "}") stack.pop();
    }
  }
  return banned;
}
