# DSH Native for Android

The Android companion mirrors the iOS contract: a native saved-server picker, trusted HTTPS-only WebView sessions, a compact browser chrome, and a mobile drawer for switching servers without losing the current page. It intentionally does **not** implement pairing, QR codes, passwords, LAN/public tunneling, cloudflared, or relay infrastructure.

## Requirements

- Android Studio Ladybug or newer
- Android SDK Platform 34
- JDK 17 or newer
- Android 8.0 / API 26 or newer

## Build

Open `android/` in Android Studio and run the `app` configuration. From a machine with Gradle available:

```sh
cd android
gradle assembleDebug
```

The app has no runtime dependencies outside the Android SDK. Website cookies and local storage use the normal WebView profile. Remote pages receive no JavaScript bridge, file access, or native host-management capability.

## Mobile UI contract

The browser shell follows the same rules as iOS:

- safe system-bar spacing and theme-aware status/navigation bars;
- 44dp touch targets and a left server drawer with a scrim;
- a compact header showing the selected server and HTTPS origin;
- bottom back/forward/reload controls;
- same-origin navigation stays in WebView; user-activated external HTTPS/mail/tel/sms links open in the system handler;
- invalid, changed, mismatched, and expired certificates fail closed; a private/self-signed certificate can proceed only after an explicit per-server SHA-256 fingerprint review, remains visibly marked as manually trusted, and can be revoked;
- cross-origin redirects and unsupported content fail closed with an actionable retry screen;
- WebView timers pause when the activity is backgrounded.

The browser-side DSH Web mobile layout remains a separate concern. For that surface, use the MIT-licensed `dsh-web-mobile` plugin; this app does not copy the GPL-2.0 `dsh-pocket` proxy/tunnel implementation.
