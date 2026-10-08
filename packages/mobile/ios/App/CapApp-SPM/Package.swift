// swift-tools-version: 6.1
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3"),
        .package(name: "CapacitorFirebaseAuthentication", path: "symlinks/CapacitorFirebaseAuthentication", traits: ["Google"]),
        .package(name: "CapacitorFirebaseMessaging", path: "symlinks/CapacitorFirebaseMessaging"),
        .package(name: "CapacitorApp", path: "../../../../../node_modules/.pnpm/@capacitor+app@8.1.2_@capacitor+core@8.5.3/node_modules/@capacitor/app"),
        .package(name: "CapacitorBrowser", path: "../../../../../node_modules/.pnpm/@capacitor+browser@8.0.5_@capacitor+core@8.5.3/node_modules/@capacitor/browser"),
        .package(name: "CapacitorKeyboard", path: "../../../../../node_modules/.pnpm/@capacitor+keyboard@8.0.6_@capacitor+core@8.5.3/node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorSplashScreen", path: "../../../../../node_modules/.pnpm/@capacitor+splash-screen@8.0.2_@capacitor+core@8.5.3/node_modules/@capacitor/splash-screen"),
        .package(name: "CapgoCapacitorUpdater", path: "../../../../../node_modules/.pnpm/@capgo+capacitor-updater@8.52.1_@capacitor+core@8.5.3/node_modules/@capgo/capacitor-updater")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorFirebaseAuthentication", package: "CapacitorFirebaseAuthentication"),
                .product(name: "CapacitorFirebaseMessaging", package: "CapacitorFirebaseMessaging"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapgoCapacitorUpdater", package: "CapgoCapacitorUpdater")
            ]
        )
    ]
)
