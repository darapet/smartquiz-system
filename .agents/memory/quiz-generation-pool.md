---
name: Quiz generation key-pool fallback
description: The dedicated quiz key pool must fall through to the shared AI pool when its configured slots are empty or exhausted.
---

The quiz-specific pool should prefer its own configured slots, then fall back to the shared main pool. It must not be configured with a no-fallback guard when the product requirement is resilient quiz generation.

**Why:** Self-quiz generation can appear broken when the dedicated slots are empty, rate-limited, or invalid even though the main pool still has usable keys.

**How to apply:** Preserve the dedicated-first order, keep provider-level fallbacks intact, and verify the shared pool is reachable after dedicated quiz attempts are exhausted.