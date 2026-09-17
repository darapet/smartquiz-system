---
name: Remote main UI sync
description: UI work may need to be retargeted when origin/main contains newer markup than the local checkout.
---

Before pushing a UI change, compare the local base with origin/main and inspect the current remote markup. If the remote branch already contains a newer screen redesign, preserve that structure and add a scoped override rather than rebasing an older markup rewrite on top.

**Why:** A local StudyCo home patch was based on an older HTML version while origin/main had already received a newer social redesign and auth fixes; blindly rebasing would have risked replacing current functionality.

**How to apply:** Fetch origin/main before committing UI work when the checkout may be stale, then target the current selectors and keep unrelated remote screens unchanged.