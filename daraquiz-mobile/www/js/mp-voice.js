/* Live voice chat for a multiplayer room.
   A small WebRTC mesh: every player who turns the mic on joins the voice room and connects to
   the others. Firestore carries the signaling (offers, answers, ICE candidates). The server keeps
   at most 12 people in the voice room, because every voice member sends audio to every other one.
   Restrictive networks may still need a TURN relay: set window._AQS_TURN_SERVERS at runtime
   (do not commit TURN credentials). */

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const STALE_SIGNAL_MS = 45000;
const CONNECT_TIMEOUT_MS = 15000;

export function createVoice({ fs, db, roomId, uid, setVoice, getPlayers, audioHost, onState, onSpeaking }) {
  const V = { stream: null, live: false, muted: true, peers: new Map(), unsub: null, timer: null, speakTimer: null, ctx: null, meters: new Map() };
  const signals = fs.collection(db, 'multiplayerRooms', roomId, 'signals');
  const iceServers = () => STUN.concat(Array.isArray(window._AQS_TURN_SERVERS) ? window._AQS_TURN_SERVERS : []);

  const state = () => (!V.live ? 'off' : V.muted ? 'muted' : 'live');
  const emit = () => onState && onState(state());

  async function send(to, kind, payload) {
    try {
      await fs.addDoc(signals, { from: uid, to, kind, data: JSON.stringify(payload), at: fs.serverTimestamp() });
    } catch (e) {
      console.warn('[voice] signal failed', e);
    }
  }

  function meter(key, stream) {
    try {
      V.ctx = V.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const analyser = V.ctx.createAnalyser();
      analyser.fftSize = 256;
      V.ctx.createMediaStreamSource(stream).connect(analyser);
      V.meters.set(key, { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
    } catch (e) { /* speaking rings are optional */ }
  }

  function startMeters() {
    if (V.speakTimer) return;
    V.speakTimer = setInterval(() => {
      const talking = new Set();
      V.meters.forEach((m, key) => {
        m.analyser.getByteFrequencyData(m.data);
        let sum = 0;
        for (const v of m.data) sum += v;
        if (sum / m.data.length > 14 && !(key === uid && V.muted)) talking.add(key);
      });
      onSpeaking && onSpeaking(talking);
    }, 180);
  }

  function closePeer(peerUid) {
    const p = V.peers.get(peerUid);
    if (!p) return;
    V.peers.delete(peerUid);
    clearTimeout(p.timeout);
    try { p.pc.close(); } catch (e) { /* already closed */ }
    p.audio.remove();
    V.meters.delete(peerUid);
  }

  function createPeer(peerUid) {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audioHost.appendChild(audio);
    const peer = { pc, audio, pending: [], remoteSet: false, timeout: null };
    V.stream.getTracks().forEach(t => pc.addTrack(t, V.stream));
    pc.onicecandidate = e => { if (e.candidate) send(peerUid, 'ice', e.candidate.toJSON()); };
    pc.ontrack = e => {
      audio.srcObject = e.streams[0];
      audio.play().catch(() => {});
      meter(peerUid, e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') clearTimeout(peer.timeout);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(peerUid);
    };
    peer.timeout = setTimeout(() => { if (pc.connectionState !== 'connected') closePeer(peerUid); }, CONNECT_TIMEOUT_MS);
    V.peers.set(peerUid, peer);
    return peer;
  }

  async function flushIce(peer) {
    peer.remoteSet = true;
    const queued = peer.pending.splice(0);
    for (const c of queued) {
      try { await peer.pc.addIceCandidate(c); } catch (e) { /* candidate may be stale */ }
    }
  }

  async function handleSignal(s) {
    if (!V.stream || !s || s.from === uid) return;
    const payload = JSON.parse(s.data);
    if (s.kind === 'offer') {
      closePeer(s.from);
      const peer = createPeer(s.from);
      await peer.pc.setRemoteDescription(payload);
      await flushIce(peer);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      send(s.from, 'answer', peer.pc.localDescription);
      return;
    }
    const peer = V.peers.get(s.from);
    if (!peer) return;
    if (s.kind === 'answer' && !peer.remoteSet) {
      await peer.pc.setRemoteDescription(payload);
      await flushIce(peer);
    } else if (s.kind === 'ice') {
      if (peer.remoteSet) { try { await peer.pc.addIceCandidate(payload); } catch (e) { /* ignore */ } } else peer.pending.push(payload);
    }
  }

  /* The player with the smaller id makes the offer, so two people never offer at once. */
  async function sync() {
    if (!V.stream) return;
    const players = getPlayers();
    const inVoice = new Set(players.filter(p => p.voice && p.uid !== uid).map(p => p.uid));
    for (const peerUid of [...V.peers.keys()]) if (!inVoice.has(peerUid)) closePeer(peerUid);
    for (const peerUid of inVoice) {
      if (V.peers.has(peerUid) || uid > peerUid) continue;
      const peer = createPeer(peerUid);
      try {
        await peer.pc.setLocalDescription(await peer.pc.createOffer());
        send(peerUid, 'offer', peer.pc.localDescription);
      } catch (e) {
        closePeer(peerUid);
      }
    }
  }

  function listen() {
    V.unsub = fs.onSnapshot(fs.query(signals, fs.where('to', '==', uid)), snap => {
      snap.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const s = change.doc.data();
        const at = s.at && s.at.toMillis ? s.at.toMillis() : Date.now();
        fs.deleteDoc(change.doc.ref).catch(() => {});
        if (Date.now() - at > STALE_SIGNAL_MS) return;
        handleSignal(s).catch(e => console.warn('[voice] signal error', e));
      });
    }, e => console.warn('[voice] listen error', e));
  }

  async function start() {
    if (V.live) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser cannot use the microphone.');
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      throw new Error(e && e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser settings.' : 'Could not start the microphone.');
    }
    try {
      await setVoice(true);
    } catch (e) {
      V.stream.getTracks().forEach(t => t.stop());
      V.stream = null;
      throw e;
    }
    V.live = true;
    V.muted = false;
    V.stream.getAudioTracks().forEach(t => { t.enabled = true; });
    meter(uid, V.stream);
    startMeters();
    listen();
    V.timer = setInterval(sync, 12000);
    emit();
    sync();
  }

  function toggleMute() {
    if (!V.live) return;
    V.muted = !V.muted;
    V.stream.getAudioTracks().forEach(t => { t.enabled = !V.muted; });
    emit();
  }

  async function toggle() {
    if (!V.live) await start();
    else toggleMute();
  }

  function stop() {
    clearInterval(V.timer);
    clearInterval(V.speakTimer);
    V.speakTimer = null;
    if (V.unsub) V.unsub();
    [...V.peers.keys()].forEach(closePeer);
    if (V.stream) V.stream.getTracks().forEach(t => t.stop());
    if (V.ctx) V.ctx.close().catch(() => {});
    V.stream = null; V.live = false; V.muted = true; V.ctx = null; V.meters.clear();
    emit();
  }

  return { toggle, sync, stop, state };
}
