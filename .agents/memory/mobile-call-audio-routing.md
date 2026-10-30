---
name: Mobile call audio routing
description: Android WebView call audio defaults and route timing
---

Android WebView calls should default to the speaker because some devices do not expose the earpiece through communication-device routing. Apply the native communication route again after getUserMedia resolves, since capture initialization can reset it.

**Why:** The web call path worked while the Capacitor app had silent microphone and speaker behavior when routing was initialized asynchronously and defaulted to an unavailable earpiece.

**How to apply:** Keep native audio focus, microphone unmute, communication mode, and speaker routing in the Android bridge. Reapply the route after capture starts, arm the remote audio element before the asynchronous remote track arrives, bind playback to the WebRTC event stream when available, and validate on two physical Android devices.