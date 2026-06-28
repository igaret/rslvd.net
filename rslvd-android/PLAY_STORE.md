# Submitting rslvd to Google Play

The app id is **`net.rslvd.client`**, `versionCode 3`, `versionName 2.0`.

## 1. Build the signed AAB

Follow [BUILD.md](BUILD.md) to create `keystore.properties`, then:

```bash
./gradlew :app:bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

This AAB is signed with your upload key (`CN=rslvd.net`). With **Play App Signing**
(recommended/default), Google re-signs the delivered APKs with the app signing key
and your upload key is only used to authenticate uploads.

## 2. Create the app in Play Console

1. <https://play.google.com/console> → **Create app**.
2. App name `rslvd`, default language, **App** type, Free.
3. Complete the required declarations:
   - **Privacy policy:** `https://rslvd.net/privacy`
   - **Data safety:** the app collects the account email and stores a session
     token on-device; network requests carry the device's public IP to perform DNS
     updates. No data is sold.
   - **Permissions justification:**
     - `INTERNET` / `ACCESS_NETWORK_STATE` — talk to the rslvd API.
     - `POST_NOTIFICATIONS` — show DDNS update status.
     - `RECEIVE_BOOT_COMPLETED` — reschedule background DDNS updates after reboot.

## 3. Upload the release

1. **Testing → Internal testing** (or **Production**) → **Create new release**.
2. Keep **Play App Signing** enabled.
3. Upload `app-release.aab`.
4. Add release notes, then **Review** and **Roll out**.

## 4. Store listing assets

- App icon: 512×512 PNG (the launcher icon is the adaptive icon in
  `app/src/main/res/mipmap-anydpi-v26/`).
- Feature graphic: 1024×500 PNG.
- Phone screenshots: at least 2 (Hosts, DDNS, and Account screens work well).

## Notes

- `minSdk 23` (Android 6.0), `targetSdk 34`.
- The app is a native REST client — there is no WebView, so there are no
  WebView/remote-content review concerns.
