# DaraQuiz AI — Build & Deploy Guide

**App Name:** DaraQuiz AI  
**App ID:** com.darapet.smartquiz  
**Built with:** Capacitor 6 wrapping existing HTML/CSS/JS web files  
**By:** Darapet Technology

---

## Project Structure

```
daraquiz-mobile/
├── www/                    ← All your web files (with ALL bugs fixed)
│   ├── js/
│   │   ├── capacitor-init.js   ← NEW: native bridge (mic, back button, audio resume)
│   │   ├── aqs-firebase.js     ← FIXED: Google sign-in works on iOS/Android
│   │   ├── aqs-challenge.js    ← FIXED: iOS voice chat, shared AudioContext
│   │   ├── aqs-study.js        ← FIXED: AbortSignal.timeout compatibility
│   │   ├── aqs-splash.js       ← FIXED: AudioContext user-gesture guard
│   │   ├── aqs-pwa.js          ← FIXED: Service worker registered (not killed)
│   │   ├── aqs-tts.js          ← FIXED: Memory leak + iOS SpeechSynthesis
│   │   ├── aqs-main.js         ← FIXED: Copy URL button works correctly
│   │   └── aqs-sw.js           ← FIXED: No WordPress rules, Firebase-safe
│   └── manifest.json           ← PWA manifest with Darapet logo
├── android/                ← Android project — open in Android Studio
│   └── app/src/main/
│       ├── AndroidManifest.xml ← All permissions: mic, camera, storage
│       └── res/mipmap-*/       ← App icon (Darapet logo) in all sizes
├── ios/                    ← iOS project — open in Xcode
│   └── App/App/
│       ├── Info.plist          ← All permission descriptions for App Store
│       └── Assets.xcassets/    ← App icon and splash screen (Darapet logo)
├── capacitor.config.ts     ← Main Capacitor configuration
└── package.json
```

---

## Build for Android

### Requirements
- Android Studio (download free from developer.android.com)
- Android SDK (installed inside Android Studio)
- Java 17+

### Steps
1. Download and unzip this project
2. Open a terminal in the project folder
3. Run: `npm install`
4. Run: `npx cap sync android`
5. Run: `npx cap open android`  — opens Android Studio
6. In Android Studio: **Build → Generate Signed Bundle/APK**
7. Choose **APK** → create a keystore → build → done!

### Or use command line (requires Android SDK in PATH):
```bash
cd android
./gradlew assembleRelease
# APK will be at: android/app/build/outputs/apk/release/app-release.apk
```

---

## Build for iOS

### Requirements
- Mac computer with Xcode installed (from the App Store)
- Apple Developer account ($99/year for App Store distribution)
- CocoaPods: `sudo gem install cocoapods`

### Steps
1. Open terminal in the project folder
2. Run: `npm install`
3. Run: `cd ios/App && pod install && cd ../..`
4. Run: `npx cap open ios`  — opens Xcode
5. In Xcode: Select your team → **Product → Archive**
6. Upload to App Store via Xcode Organizer

---

## Build for Desktop (Electron/PWA)

### PWA (no install needed — works in Chrome/Edge on any desktop):
Just host the `www/` folder and it installs as a desktop app via Chrome's "Install App" feature.

### With Electron (optional, for a standalone .exe/.app):
```bash
npm install --save-dev @capacitor-community/electron
npx cap add @capacitor-community/electron
npx cap open @capacitor-community/electron
```

---

## Update the web files

When you change any file inside `www/`:
```bash
npx cap sync
```
This copies updated web files to both android/ and ios/ automatically.

---

## All Bugs Fixed

| File | Bug Fixed |
|------|-----------|
| aqs-firebase.js | Google sign-in broken on mobile — now uses redirect |
| aqs-challenge.js | Voice chat dead on iPhone — added audio/mp4 MIME type |
| aqs-challenge.js | iOS audio dies after 6 sounds — shared AudioContext |
| aqs-study.js | App crash on old Android — replaced AbortSignal.timeout() |
| aqs-splash.js | Boot chime blocked on mobile — user-gesture guard added |
| aqs-pwa.js | Offline broken — service worker now registered not killed |
| aqs-tts.js | Memory leak + iOS TTS silent — both fixed |
| aqs-main.js | Copy link button broken — fixed $(this) in promise |
| aqs-sw.js | WordPress rules removed — Firebase-safe cache strategy |
| capacitor-init.js | NEW: native bridge for mic, back button, audio, safe area |

---

## Logo / Icons

The Darapet Technology logo is placed at:
- `www/img/icon-192.png` and `icon-512.png` (web PWA)
- `android/app/src/main/res/mipmap-*/ic_launcher.png` (Android)
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/` (iOS)
- `ios/App/App/Assets.xcassets/Splash.imageset/splash.png` (iOS splash)
- `android/app/src/main/res/drawable/splash.png` (Android splash)

To generate properly-sized icons for all resolutions, use:
https://capacitorjs.com/docs/guides/splash-screens-and-icons
(Upload your `resources/icon.png` — already placed in the project)
