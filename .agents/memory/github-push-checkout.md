---
name: GitHub push checkout
description: Reliable GitHub push handling when a nested checkout loses its remote metadata after a secure secret handoff
---

When a GitHub checkout is nested inside the workspace, verify its Git root and remotes again after a secure secret form returns. If the nested `.git` metadata has been replaced by the workspace backup repository, clone the GitHub remote into a temporary directory, overlay the verified project files, and push from that clean checkout.

**Why:** The secure-secret handoff can restore the workspace’s backup Git metadata while leaving the nested project files present, making a previously valid `origin` disappear or point at the wrong repository.

**How to apply:** Never force-push the backup repository. Confirm the target remote and branch from a fresh clone, run the relevant checks there, then push with the secret supplied through the environment.