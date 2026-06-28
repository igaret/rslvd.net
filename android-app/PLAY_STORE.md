# Publishing the rslvd.net app to Google Play

Complete, step-by-step guide to build a signed Android App Bundle (`.aab`) and
submit it to the Google Play Store.

- **Package name:** `net.rslvd.client`
- **Current version:** `versionCode 2` / `versionName 1.1` (in `android/app/build.gradle`)

---

## 0. Prerequisites

- **Node.js** 18+ and **npm**
- **Java 17** (JDK)
- **Android SDK** with platform `android-34` and build-tools `34.0.0`
  - Set `ANDROID_HOME` (e.g. `export ANDROID_HOME=$HOME/android-sdk`)
- A **Google Play Developer account** ($25 one-time fee): https://play.google.com/console/signup

---

## 1. Create your upload keystore (one time only)

Google Play uses **Play App Signing**: you sign your uploads with an *upload key*,
and Google holds the real *app signing key*. You only ever generate the upload key.

```bash
cd android-app/android
keytool -genkeypair -v -keystore rslvd-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias rslvd
```

Answer the prompts (name, org, etc.) and pick a strong password.

> **Back this file up somewhere safe.** If you lose it you can reset it through
> Play Console support, but it's a hassle. Never commit it to git — it is
> gitignored.

### Wire the keystore into Gradle

Copy the template and fill in your passwords:

```bash
cd android-app/android
cp keystore.properties.example keystore.properties
```

Edit `keystore.properties`:

```properties
storeFile=rslvd-upload.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=rslvd
keyPassword=YOUR_KEY_PASSWORD
```

`build.gradle` reads this file automatically. Both `keystore.properties` and
`*.jks` are gitignored, so secrets never get committed. If `keystore.properties`
is absent, the build still works but produces an **unsigned** bundle.

---

## 2. Build the signed AAB

```bash
cd android-app
npm install
npm run build          # copies the web app into www/ (excludes the heavy /dl binaries)
npx cap sync android   # syncs web assets + plugins into the Android project
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

### Verify it's signed

```bash
unzip -l app/build/outputs/bundle/release/app-release.aab | grep META-INF
# should list META-INF/RSLVD.SF, META-INF/RSLVD.RSA, META-INF/MANIFEST.MF
```

> **One command shortcut:** `npm run cap:build` runs `cap sync` + `bundleRelease`.

### (Optional) Test on a device first

Build an APK and sideload it before shipping:

```bash
cd android && ./gradlew assembleRelease
adb install app/build/outputs/apk/release/app-release.apk
```

Or use [bundletool](https://github.com/google/bundletool) to generate device APKs
from the `.aab` and test the exact artifact you're uploading.

---

## 3. Create the app in Play Console

1. Go to https://play.google.com/console → **Create app**
2. Fill in:
   - **App name:** `rslvd.net`
   - **Default language**, **App or Game:** App, **Free or Paid:** Free
3. Accept the declarations → **Create app**

---

## 4. Complete the required setup (left nav → "Dashboard" / "Policy")

Google blocks your first release until these are done:

- **App access** — if login is required, provide test credentials (a demo
  rslvd.net account) so reviewers can sign in.
- **Ads** — declare whether the app contains ads (it doesn't).
- **Content rating** — fill out the questionnaire (utility app, no objectionable content).
- **Target audience** — select age groups (not directed at children).
- **Data safety** — declare what data is collected. The app handles the user's
  rslvd.net **email + auth token** for login and stores DDNS hostnames/update keys
  locally. Network requests go only to `rslvd.net`. Declare accordingly (data is
  transmitted over HTTPS, not sold).
- **Privacy policy** — provide a public URL (e.g. `https://rslvd.net/privacy`).
- **Government apps / Financial features / Health** — declare "No" as applicable.

---

## 5. Store listing (left nav → "Store presence → Main store listing")

- **Short description** (≤80 chars), e.g.
  *"Manage your rslvd.net subdomains & tunnels and keep them pointed at your device."*
- **Full description** — what the app does (dashboard access + background DDNS updates).
- **App icon** — 512×512 PNG (32-bit, with alpha).
- **Feature graphic** — 1024×500 PNG/JPG.
- **Phone screenshots** — at least 2 (min 320px, max 3840px on a side). Capture
  the dashboard, hosts, tunnels, and the DDNS auto-updater card.

---

## 6. First release (Play App Signing)

1. Left nav → **Release → Testing → Internal testing** (recommended for the first
   upload), or **Production** when ready.
2. **Create new release**.
3. On first upload Play prompts you to enable **Play App Signing** — accept
   (**"Let Google manage and protect your app signing key"**). Google generates
   the app signing key; your `rslvd-upload.jks` stays the upload key.
4. **Upload** `app-release.aab`.
5. Add **release notes**.
6. **Save → Review release → Start rollout**.

For internal testing, add tester email addresses and share the opt-in link. Once
verified, promote the same release to **Production**.

---

## 7. Updating the app later

1. Bump the version in `android/app/build.gradle`:
   ```gradle
   versionCode 3        // must increase every upload
   versionName "1.2"    // human-readable
   ```
2. Rebuild (`npm run build && npx cap sync android && cd android && ./gradlew bundleRelease`).
3. Upload the new `.aab` to a new release. Sign with the **same** `rslvd-upload.jks`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `app-release.aab` has no `META-INF/*.RSA` | `keystore.properties` not found by Gradle. It must sit in `android-app/android/` (the Gradle root, next to `gradlew`). |
| `keystore.properties` ignored | Check `storeFile` path is relative to `android-app/android/`. |
| "You uploaded an APK/AAB signed with a key that is not your upload key" | You signed with the wrong keystore. Always use `rslvd-upload.jks`. |
| "Version code N has already been used" | Increase `versionCode` in `build.gradle`. |
| Build fails: SDK not found | `echo "sdk.dir=$ANDROID_HOME" > android/local.properties` |
