---
name: StudyCo chat permissions
description: Firestore permission constraints for creating and reopening one-to-one StudyCo conversations.
---

Opening a one-to-one conversation must not rewrite its `participantIds` array. Existing records may have been created with the two IDs in the opposite order, and a rule that protects participant membership can reject that harmless rewrite.

**Why:** Treating an existing conversation like a new merge operation caused a permission error when the other participant created it first.

**How to apply:** Read the deterministic conversation document first; return it unchanged when both participants are present. Only create a missing document. The rules must allow a signed-in participant to `get` a missing deterministic document so the client can distinguish “create” from “open.”