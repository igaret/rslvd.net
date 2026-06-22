# rslvd.net Android App

Package name: `net.rslvd.client`

## Architecture

- **Capacitor** wraps the live `https://rslvd.net` site in a native WebView
- **DdnsPlugin** (custom Capacitor plugin) bridges web ↔ native for DDNS settings
- **DdnsUpdateWorker** (WorkManager) runs every 15 min to update hostnames with the device's public IP
- Users log in via the normal web flow; the app stores their auth token natively for background updates

## Building

```bash
# Prerequisites: Node.js, Android SDK (API 34), Java 17
cd android-app
npm install
npx cap sync android

# Build AAB (for Play Store)
cd android
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab

# Build APK (for testing)
./gradlew assembleRelease
```

## Signing for Play Store

Before submitting to Google Play, sign the AAB with your upload key:

```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore your-upload-key.jks \
  app/build/outputs/bundle/release/app-release.aab \
  your-key-alias
```

Or configure signing in `app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file('path/to/keystore.jks')
            storePassword 'password'
            keyAlias 'alias'
            keyPassword 'password'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

## Features

- Full dashboard access (login, manage hosts, manage tunnels)
- Background DDNS updates every 15 minutes via WorkManager
- Works offline (shows offline page, auto-reconnects)
- Native Android notifications for update status
- Branded splash screen with rslvd.net theme
