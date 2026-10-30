# DaraQuiz AI — Complete GitHub Setup Guide

## Step 1: Push to GitHub

1. Create a new repository on GitHub (e.g. `daraquiz-mobile`)
2. Open a terminal and run:

```bash
cd daraquiz-mobile
git init
git add .
git commit -m "Initial DaraQuiz AI Capacitor project"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/daraquiz-mobile.git
git push -u origin main
```

## Step 2: Download Your APK

1. Go to your GitHub repo → click **Actions** tab
2. Click the latest workflow run named **Build Android APK**
3. Wait for it to finish (takes about 5–10 minutes)
4. Click **Artifacts** at the bottom → download **daraquiz-ai-debug**
5. Unzip the downloaded file — inside is `app-debug.apk`
6. Transfer to your Android phone and install!

> **Enable Unknown Sources:** On Android, go to Settings → Apps → Special Access → Install Unknown Apps → enable for your file manager.

---

## Step 3: Set Up Signed APK for Play Store (Optional)

### Generate your keystore (do this once on your computer):

```bash
keytool -genkey -v -keystore daraquiz-release.keystore \
  -alias daraquiz \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=DaraQuiz AI, OU=Darapet, O=Darapet Technology, L=Lagos, ST=Lagos, C=NG"
```

Choose a strong password and **save it safely** — you'll need it forever to update your app.

### Add secrets to GitHub:

Run this to get the Base64 of your keystore:
```bash
base64 -w0 daraquiz-release.keystore
```

Then in GitHub → Settings → Secrets → Actions, add these 4 secrets:

| Name | Value |
|------|-------|
| `KEYSTORE_BASE64` | Paste the base64 output |
| `KEYSTORE_PASSWORD` | Your keystore password |
| `KEY_ALIAS` | `daraquiz` |
| `KEY_PASSWORD` | Your key password |

After this, every push produces a **signed APK** in the `daraquiz-ai-release-signed` artifact.

---

## Step 4: Add Google Sign-In for Android (Optional)

1. Go to [Firebase Console](https://console.firebase.google.com/project/smartquiz-darapet)
2. Project Settings → Your Apps → Add App → Android
3. Package name: `com.darapet.smartquiz`
4. Download `google-services.json`
5. Place it in your repo at: `android/app/google-services.json`  
   *(This folder is created after your first GitHub Actions run — or locally after `npx cap add android`)*

---

## Step 5: Update the App Icon

To replace the placeholder icon with your real Darapet logo:

1. Make sure `logo-source.png` is the correct logo (1024×1024 px recommended)
2. Run locally:
   ```bash
   npm install sharp
   node generate-icons.js
   ```
3. Commit and push the updated `resources/` folder
4. GitHub Actions will copy these into the Android build automatically

---

## What Gets Built

| Artifact | File | Use |
|----------|------|-----|
| `daraquiz-ai-debug` | `app-debug.apk` | Testing on your phone |
| `daraquiz-ai-release-unsigned` | `app-release-unsigned.apk` | Internal testing |
| `daraquiz-ai-release-signed` | `app-release.apk` | Play Store upload |

---

## Firestore Security Rules

Your `www/firestore.rules` file contains the security rules. To apply them:

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Deploy: `firebase deploy --only firestore:rules --project smartquiz-darapet`

Or paste the rules manually in the [Firebase Console](https://console.firebase.google.com/project/smartquiz-darapet/firestore/rules).

---

## Need Help?

If the build fails on GitHub Actions:
1. Click the failed workflow → expand the failing step
2. Look for the error message
3. Common fixes:
   - **Gradle build fails** → The `npx cap add android` step may need internet — re-run the workflow
   - **Icon copy fails** → The `resources/` folder may be missing files — run `node generate-icons.js` locally first
   - **Capacitor sync fails** → Make sure `capacitor.config.json` has `"webDir": "www"` ✓
