import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, test } from "vitest";
import capacitorConfig from "../capacitor.config";
import mobilePackage from "../package.json";
import {
  bannedGradleDependencies,
  bannedSwiftProducts,
  generatedSwiftTraits,
  gradleVariables,
  swiftPackageName,
  swiftToolsVersion,
  xcodePackageProducts,
} from "./native-dependency-policy";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) =>
  readFileSync(path.join(mobileRoot, file), "utf8");
const spm = capacitorConfig.experimental?.ios?.spm;
const requestedTraits = spm?.packageTraits ?? {};

const require = createRequire(path.join(mobileRoot, "package.json"));
const plugins = Object.keys(mobilePackage.dependencies)
  .map((id) => ({
    id,
    root: path.dirname(require.resolve(`${id}/package.json`)),
  }))
  .filter(
    ({ root }) =>
      "capacitor" in JSON.parse(readFileSync(`${root}/package.json`, "utf8")),
  );

describe("installed native plugins", () => {
  const generated = read("ios/App/CapApp-SPM/Package.swift");
  const variables = gradleVariables(read("android/variables.gradle"));

  test("the policy sees the Firebase plugins", () => {
    expect(plugins.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "@capacitor-firebase/authentication",
        "@capacitor-firebase/messaging",
      ]),
    );
  });

  test.each(
    plugins,
  )("$id links no Facebook or analytics SDK on iOS", (plugin) => {
    const manifestPath = `${plugin.root}/Package.swift`;
    if (!existsSync(manifestPath)) return;
    const manifest = readFileSync(manifestPath, "utf8");
    expect(bannedSwiftProducts(manifest, requestedTraits[plugin.id])).toEqual(
      [],
    );
    // The generated manifest is what Xcode builds; a stale one means `sync`
    // has not run since the traits changed.
    expect(generatedSwiftTraits(generated, swiftPackageName(manifest))).toEqual(
      requestedTraits[plugin.id] ?? [],
    );
  });

  test.each(
    plugins,
  )("$id packages no Facebook or analytics SDK on Android", (plugin) => {
    const gradlePath = `${plugin.root}/android/build.gradle`;
    if (!existsSync(gradlePath)) return;
    expect(
      bannedGradleDependencies(readFileSync(gradlePath, "utf8"), variables),
    ).toEqual([]);
  });

  test("the generated manifest uses the configured Swift tools version", () => {
    expect(swiftToolsVersion(generated)).toBe(spm?.swiftToolsVersion);
  });

  test("the Xcode app target links only the Capacitor package", () => {
    expect(
      xcodePackageProducts(read("ios/App/App.xcodeproj/project.pbxproj")),
    ).toEqual(["CapApp-SPM"]);
  });
});

describe("policy parsers", () => {
  const manifest = `
    traits: [
        .default(enabledTraits: ["Google", "Facebook"]),
        .trait(name: "Lite", description: "No optional SDKs (all of them)."),
        .trait(name: "Social", enabledTraits: ["Facebook"]),
        .trait(name: "Google"),
        .trait(name: "Facebook")
    ],
    dependencies: [],
    targets: [.target(name: "Plugin", dependencies: [
        .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
        .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS",
                 condition: .when(traits: ["Google"])),
        .product(name: "FacebookLogin", package: "facebook-ios-sdk",
                 condition: .when(traits: ["Facebook"]))
    ])]`;

  test("a Swift package's default traits link a conditional banned SDK", () => {
    expect(bannedSwiftProducts(manifest, undefined)).toEqual([
      "facebook-ios-sdk/FacebookLogin",
    ]);
    expect(bannedSwiftProducts(manifest, [".defaults"])).toHaveLength(1);
    expect(bannedSwiftProducts(manifest, ["Social"])).toHaveLength(1);
    expect(bannedSwiftProducts(manifest, ["Google"])).toEqual([]);
    expect(bannedSwiftProducts(manifest, ["Lite"])).toEqual([]);
  });

  test("an unconditional analytics product is always banned", () => {
    const analytics = `.product(name: "FirebaseAnalytics", package: "firebase-ios-sdk")`;
    expect(bannedSwiftProducts(analytics, ["Lite"])).toEqual([
      "firebase-ios-sdk/FirebaseAnalytics",
    ]);
  });

  test("a Gradle flag guards a banned artifact only when the app sets it", () => {
    const gradle = `dependencies {
    implementation "com.google.firebase:firebase-auth:24.0.1"
    implementation "com.google.firebase:firebase-measurement-connector:19.0.0"
    if (includeFacebook) {
      implementation "com.facebook.android:facebook-login:18.1.3"
    } else {
      compileOnly "com.facebook.android:facebook-login:18.1.3"
    }
    if (!skipAnalytics) {
      implementation "com.google.firebase:firebase-analytics:23.0.0"
    }
}`;
    const facebook = "com.facebook.android:facebook-login";
    const analytics = "com.google.firebase:firebase-analytics";
    expect(bannedGradleDependencies(gradle, new Map())).toEqual([
      facebook,
      analytics,
    ]);
    const off = new Map([
      ["includeFacebook", "false"],
      ["skipAnalytics", "true"],
    ]);
    expect(bannedGradleDependencies(gradle, off)).toEqual([]);
    const on = new Map([
      ["includeFacebook", "true"],
      ["skipAnalytics", "true"],
    ]);
    expect(bannedGradleDependencies(gradle, on)).toEqual([facebook]);
  });

  test("the generated manifest's traits are read per package", () => {
    const generated = `.package(name: "A", path: "symlinks/A", traits: [.defaults, "Google"]),
        .package(name: "B", path: "../b")`;
    expect(generatedSwiftTraits(generated, "A")).toEqual([
      ".defaults",
      "Google",
    ]);
    expect(generatedSwiftTraits(generated, "B")).toEqual([]);
    expect(generatedSwiftTraits(generated, "C")).toBeNull();
  });
});
