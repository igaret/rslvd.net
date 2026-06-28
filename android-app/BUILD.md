# rslvd.net Android App

Package name: `net.rslvd.client`

## Architecture

- **Capacitor** wraps the live `https://rslvd.net` site in a native WebView
- **DdnsPlugin** (custom Capacitor plugin) bridges web ↔ native for DDNS settings.
  The web dashboard's "DDNS Auto-Updater" card detects the native runtime and
  hands the selected hosts' update keys to the native updater via
  `DdnsClient.setHosts(...)`.
- **DdnsUpdateWorker** (WorkManager) runs every 15 min to update hostnames with
  the device's public IP, then posts a status notification.
- **BootReceiver** reschedules the worker after a reboot or app update.
- Users log in via the normal web flow; the app stores their auth token natively.

## Building

```bash
# Prerequisites: Node.js, Android SDK (API 34, build-tools 34.0.0), Java 17
cd android-app
npm install
npm run build          # copies app/public into www/ (excludes heavy /dl binaries)
npx cap sync android

# Build AAB (for Play Store)
cd android
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab

# Build APK (for testing)
./gradlew assembleRelease
```

`npm run cap:build` runs `cap sync` + `bundleRelease` in one step.

## Signing

Release signing is wired through `android/keystore.properties` (gitignored).
Copy `android/keystore.properties.example` → `android/keystore.properties`, fill
in your upload-key details, and `bundleRelease` produces a signed `.aab`. Without
that file the build still succeeds but the bundle is unsigned.

See **[PLAY_STORE.md](./PLAY_STORE.md)** for the full keystore generation +
Google Play submission walkthrough.

## Features

- Full dashboard access (login, manage hosts, manage tunnels)
- Background DDNS updates every 15 minutes via WorkManager (native, reliable —
  not dependent on the WebView's service-worker periodic sync)
- Update-status notifications (Android 13+ requests POST_NOTIFICATIONS at launch)
- Reschedules background updates after device reboot / app update
- Branded splash screen with rslvd.net theme

## Version

Set in `android/app/build.gradle` — bump `versionCode` (integer, must increase
every upload) and `versionName` (human-readable) for each Play release.
Currently `versionCode 2` / `versionName 1.1`.
