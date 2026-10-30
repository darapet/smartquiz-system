---
name: Cloudinary configuration boundary
description: The security and failover rule for browser-based media uploads.
---

Store only Cloudinary cloud names, unsigned upload presets, folder prefixes, labels, and enabled states in the publicly readable upload-settings document. Never put Cloudinary API keys or API secrets in that document.

**Why:** The static SmartQuiz client uploads directly from the browser, while the existing settings surface is readable by public pages. Unsigned presets allow uploads without exposing account-management credentials, and a separate document prevents unrelated admin settings from being coupled to media uploads.

**How to apply:** Keep the upload UI capped at six accounts. Filter to enabled accounts at runtime, try them in round-robin order, and report all account failures instead of silently falling back to Firebase Storage.