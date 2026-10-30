# DaraQuiz AI — Mobile App

**By Darapet Technology**  
App ID: `com.darapet.smartquiz`  
Platform: Android & iOS via Capacitor

---

## What This Is

DaraQuiz AI is a fully offline-capable quiz app powered by Firebase (Firestore, Auth, Realtime DB) and AI features (Groq). This repo wraps the complete web app in Capacitor so it can be built as a native Android APK and iOS IPA — no code changes needed to the web files.

---

## 🚀 Quick Start — GitHub Actions (No Local Setup)

**This is the easiest way.** Just push to GitHub and download the APK.

1. Push this entire folder to a new GitHub repository
2. GitHub Actions runs automatically on every push to `main`
3. Go to **Actions** tab → click the latest workflow run → download `daraquiz-ai-debug.apk`
4. Install on your Android device and test!

---

## 📱 Build Locally

### Requirements
- Node.js 18+
- Java 17 (JDK)
- Android Studio (for Android)
- Xcode 14+ and macOS (for iOS)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/daraquiz-mobile.git
cd daraquiz-mobile

# 2. Install dependencies
npm install

# 3. Add native platforms
npx cap add android
npx cap add ios       # macOS only

# 4. Generate icons from logo
npm install sharp
node generate-icons.js

# 5. Sync web files and plugins to native projects
npx cap sync

# 6. Open in Android Studio (then Build → Generate APK)
npx cap open android

# 7. OR build APK directly from command line
cd android && ./gradlew assembleDebug
```

The debug APK will be at:  
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🔑 Firebase Setup (Already Configured)

The app already uses this Firebase project:
- **Project ID:** `smartquiz-darapet`
- **Auth Domain:** `smartquiz-darapet.firebaseapp.com`
- **RTDB:** `smartquiz-darapet-default-rtdb.firebaseio.com`

The config is in `www/js/aqs-firebase.js`. No changes needed unless you want to use your own Firebase project.

### For Google Sign-In on Android (Optional)

1. Go to [Firebase Console](https://console.firebase.google.com/) → your project
2. Click **Project Settings** → **General** → **Your apps**
3. Add an Android app with package `com.darapet.smartquiz`
4. Download `google-services.json`
5. Place it at `android/app/google-services.json` (after running `npx cap add android`)

---

## 🔏 Signed Release APK (for Play Store)

### Step 1 — Generate a keystore (one time only)

```bash
keytool -genkey -v -keystore release-key.keystore \
  -alias daraquiz \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=DaraQuiz AI, OU=Darapet, O=Darapet Technology, L=YourCity, ST=YourState, C=NG"
```

### Step 2 — Add secrets to GitHub

In your GitHub repo → **Settings** → **Secrets and variables** → **Actions**, add:

| Secret name        | Value                                      |
|--------------------|--------------------------------------------|
| `KEYSTORE_BASE64`  | `base64 -w0 release-key.keystore`          |
| `KEYSTORE_PASSWORD`| The password you used when generating      |
| `KEY_ALIAS`        | `daraquiz`                                 |
| `KEY_PASSWORD`     | The key password (same or different)       |

Once secrets are added, every push to `main` produces a **signed** release APK ready for Play Store upload.

---

## 📁 Project Structure

```
daraquiz-mobile/
├── www/                    ← All web app files (HTML, CSS, JS)
│   ├── index.html          ← App entry point
│   ├── js/                 ← JavaScript modules
│   ├── css/                ← Stylesheets
│   ├── img/                ← Images and characters
│   ├── audio/              ← Background music
│   └── capacitor-bridge.js ← Native bridge (auto-injected)
├── resources/              ← App icons and splash screens
│   ├── android/icon/       ← Android mipmap icons (all sizes)
│   ├── android/splash/     ← Android splash screens (all orientations)
│   └── ios/icon/           ← iOS icon set (all sizes)
├── logo-source.png         ← Source logo (Darapet Technology)
├── capacitor.config.json   ← Capacitor configuration
├── package.json            ← NPM config and scripts
├── generate-icons.js       ← Icon generator script
├── .github/workflows/      ← GitHub Actions CI/CD
│   ├── build-android.yml   ← Android APK builder
│   └── build-ios.yml       ← iOS IPA builder (macOS runner)
└── android-config/         ← Reference Android config files
```

---

## 🎨 Updating the App Icon

Replace `logo-source.png` with your new icon (1024×1024 px, PNG), then run:

```bash
npm install sharp        # if not already installed
node generate-icons.js   # generates all sizes
npx cap sync             # copies to native projects
```

---

## 🌐 App Features

- 🔐 Firebase Authentication (email/password + Google)
- 📊 Quiz creation and management
- 🎯 Challenge mode with real-time opponents
- 🤖 AI-powered quiz generation (Groq)
- 🗣️ Text-to-speech (TTS)
- 🖼️ AI image generation
- 📚 Study mode with skills tracking
- 📡 Works offline (cached content)

---

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| White screen on launch | Check `www/index.html` exists |
| Firebase errors | Verify `firestore.rules` are published in Firebase Console |
| Build fails on GitHub | Check Java 17 and Node 20 are set in the workflow |
| Icon not updating | Run `node generate-icons.js` then `npx cap sync` |
| Google Sign-In fails | Add `google-services.json` to `android/app/` |

---

## 📞 Support

**Darapet Technology** — Building smart solutions.  
App ID: `com.darapet.smartquiz`
