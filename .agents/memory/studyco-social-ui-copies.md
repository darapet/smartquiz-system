---
name: StudyCo social UI copies
description: Durable convention for keeping the web and Capacitor copies visually aligned.
---
The StudyCo social experience is maintained in both the root web copy and the Capacitor app copy; shared visual shell changes should be applied to both surfaces in the same correction.

**Why:** The app and web versions use separate HTML, CSS, and JavaScript entry points, so updating only one creates visibly different social screens.

**How to apply:** For home, Friends, Messages, or navigation changes, update the matching files under the root and `daraquiz-mobile/www/`, then run syntax and duplicate-ID checks for both copies.