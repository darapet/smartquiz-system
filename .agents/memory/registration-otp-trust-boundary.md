---
name: Registration OTP trust boundary
description: Security constraint for SmartQuiz email verification during staged registration
---

The browser registration flow must not be treated as the final security boundary for email verification. OTP generation, verification, expiry, and resend throttling should move to trusted server or Cloud Functions code before production launch.

**Why:** A client that can read or write its own OTP fields can tamper with client-controlled registration state even when ordinary Firestore transitions are restricted.

**How to apply:** Keep the UI and Firebase Auth password flow independent from OTP delivery, store only server-verifiable state in Firestore, and enforce rate limits outside the browser.