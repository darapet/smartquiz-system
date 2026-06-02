# DaraQuiz Admin App

Admin-only mobile app for managing the DaraQuiz / xzily AI platform.

## Features
- Admin dashboard & stats
- Host management (approve / suspend)
- Quiz management (create, edit, delete any quiz)
- App settings & update management
- About / content pages

## Build the APK

```bash
# 1. Install dependencies
npm install

# 2. Sync web assets to Android
npx cap sync android

# 3. Build release APK
cd android && ./gradlew assembleRelease
```

Signed APK output: `android/app/build/outputs/apk/release/app-release.apk`

## App ID
`com.darapet.adminquiz` (separate from the main app `com.darapet.smart`)
