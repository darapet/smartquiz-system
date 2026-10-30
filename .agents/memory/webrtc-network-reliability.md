---
name: StudyCo WebRTC network reliability
description: Network constraints and relay requirements for StudyCo voice and video calls.
---

StudyCo voice and video calls use Firestore for signaling and public STUN servers for peer discovery. This works on many networks but is not sufficient for every carrier NAT, symmetric NAT, or corporate firewall.

**Why:** A call can be correctly signaled and still fail to connect media when the peers cannot establish a direct route.

**How to apply:** Preserve the Firestore signaling flow, but add an authenticated TURN provider to the ICE server configuration before claiming reliable calling across arbitrary networks. Keep the TURN credentials out of committed client code.

The ICE candidate queue must distinguish candidates that are waiting for `setRemoteDescription()` from candidates already passed to `addIceCandidate()`. Marking queued candidates as already added causes the flush step to skip them, which can produce the first-call one-way-audio failure.