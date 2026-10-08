# Houston mobile shell

This Capacitor 8 package wraps the shared `packages/web` build. Its Vite config
reuses the web aliases, defines, React setup, and Tailwind setup; the mobile
entry sets the native surface and deploy environment before loading the web
entry. All product behavior remains in the shared app and SDK.
`assets/logo.png` is derived from `packages/web/public/icons/houston-512.png`;
the generated icon and splash assets use the light background token.

## Prerequisites

- Node and pnpm from the repository toolchain.
- iOS: Xcode 26 or newer and an installed iOS simulator. The generated project
  uses Swift Package Manager.
- Android: Android Studio, its SDK, and a compatible JDK.

## Environment

`VITE_CONTROL_PLANE_URL` is required. Production uses
`https://gateway.gethouston.ai`. `HOUSTON_MOBILE_DEPLOY_ENV` is `production`
by default; set it to `preview` or `development` for those builds. The WebView
hostname is always `localhost`, so this value is baked during the mobile build.
`FIREBASE_API_KEY` is also required so the cloud sign-in screen can render.

For a release build, provide the same public identity and telemetry values as
the cloud web build: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`,
`FIREBASE_PROJECT_ID`, `POSTHOG_KEY`, `POSTHOG_HOST`, and `SENTRY_DSN`.
Local builds also read the public `FIREBASE_*` values from the repository's
`.env.local` when those variables are not exported. No other values from that
file enter the mobile bundle.
`VITE_AGENTSTORE_GATEWAY_URL` and `VITE_CLIENT_METRICS_GATEWAY_URL` can target
the gateway independently when needed. Do not put credentials in native source.

## Build and run

From the repository root:

```sh
VITE_CONTROL_PLANE_URL=https://gateway.gethouston.ai pnpm --filter houston-mobile sync
pnpm --filter houston-mobile ios
pnpm --filter houston-mobile run:ios
pnpm --filter houston-mobile android
```

`sync` builds the mobile entry into `packages/mobile/dist`, then copies it to
both native projects and updates native plugins. `ios` and `android` open the
generated projects in their IDEs. `run:ios` runs on an available simulator.
To build in Xcode directly, open `packages/mobile/ios/App/App.xcodeproj` and
select an iOS simulator. Android Studio opens `packages/mobile/android`;
build or run the `app` target there after `sync`.
