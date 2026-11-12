/* SmartQuiz multiplayer voice.
   WebRTC mesh with Firestore signaling. The room server limits voice participation to 12.
   Optional TURN servers are supplied at runtime through window._AQS_TURN_SERVERS;
   never commit TURN credentials to the repository. */

const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
const STALE_SIGNAL_MS = 45000;
const CONNECT_TIMEOUT_MS = 20000;
const SYNC_INTERVAL_MS = 4000;
const DISCONNECT_GRACE_MS = 8000;

export function createVoice({ fs, db, roomId, uid, setVoice, getPlayers, audioHost, onState, onSpeaking, onError }) {
  const V = {
    stream: null, live: false, muted: true, peers: new Map(),
    unsub: null, timer: null, speakTimer: null, ctx: null, meters: new Map(),
    stopped: false
  };
  const signals = fs.collection(db, 'multiplayerRooms', roomId, 'signals');
  const iceServers = () => STUN.concat(
    Array.isArray(window._AQS_TURN_SERVERS) ? window._AQS_TURN_SERVERS : []
  );

  const state = () => (!V.live ? 'off' : V.muted ? 'muted' : 'live');
  const emit = () => onState && onState(state());
  const report = message => { if (onError) onError(message); else console.warn('[voice]', message); };

  async function send(to, kind, payload) {
    try {
      await fs.addDoc(signals, {
        from: uid, to, kind, data: JSON.stringify(payload), at: fs.serverTimestamp()
      });
      return true;
    } catch (e) {
      console.warn('[voice] signal send failed', e);
      report('Voice connection is having trouble. Retrying automatically…');
      return false;
    }
  }

  function meter(key, stream) {
    try {
      if (!window.AudioContext && !window.webkitAudioContext) return;
      V.ctx = V.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const analyser = V.ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.65;
      const source = V.ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      V.meters.set(key, { analyser, data: new Uint8Array(analyser.fftSize), source });
    } catch (e) {
      console.debug('[voice] speaking meter unavailable', e);
    }
  }

  function startMeters() {
    if (V.speakTimer) return;
    V.speakTimer = setInterval(() => {
      const talking = new Set();
      V.meters.forEach((m, key) => {
        m.analyser.getByteTimeDomainData(m.data);
        let energy = 0;
        for (const value of m.data) {
          const sample = (value - 128) / 128;
          energy += sample * sample;
        }
        const rms = Math.sqrt(energy / m.data.length);
        if (rms > 0.035 && !(key === uid && V.muted)) talking.add(key);
      });
      if (onSpeaking) onSpeaking(talking);
    }, 160);
  }

  function closePeer(peerUid) {
    const peer = V.peers.get(peerUid);
    if (!peer) return;
    V.peers.delete(peerUid);
    clearTimeout(peer.timeout);
    clearTimeout(peer.disconnectTimer);
    try { peer.pc.ontrack = null; peer.pc.onicecandidate = null; peer.pc.close(); } catch (e) {}
    if (peer.audio) {
      peer.audio.pause();
      peer.audio.srcObject = null;
      peer.audio.remove();
    }
    const meterEntry = V.meters.get(peerUid);
    if (meterEntry && meterEntry.source) {
      try { meterEntry.source.disconnect(); } catch (e) {}
    }
    V.meters.delete(peerUid);
  }

  function createPeer(peerUid) {
    const pc = new RTCPeerConnection({ iceServers: iceServers(), iceCandidatePoolSize: 2 });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('aria-label', 'Room voice audio');
    audio.preload = 'none';
    audio.volume = 1;
    audioHost.appendChild(audio);

    const peer = { pc, audio, pending: [], remoteSet: false, timeout: null, disconnectTimer: null };
    V.stream.getAudioTracks().forEach(track => pc.addTrack(track, V.stream));

    pc.onicecandidate = event => {
      if (event.candidate) send(peerUid, 'ice', event.candidate.toJSON());
    };
    pc.ontrack = event => {
      const remoteStream = event.streams && event.streams[0];
      if (!remoteStream) return;
      audio.srcObject = remoteStream;
      audio.play().catch(() => {
        report('Your device blocked voice playback. Tap the microphone button once to enable audio.');
      });
      meter(peerUid, remoteStream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(peer.timeout);
        clearTimeout(peer.disconnectTimer);
      } else if (pc.connectionState === 'disconnected') {
        clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = setTimeout(() => {
          if (pc.connectionState === 'disconnected') closePeer(peerUid);
        }, DISCONNECT_GRACE_MS);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        closePeer(peerUid);
      }
    };
    peer.timeout = setTimeout(() => {
      if (pc.connectionState !== 'connected') closePeer(peerUid);
    }, CONNECT_TIMEOUT_MS);
    V.peers.set(peerUid, peer);
    return peer;
  }

  async function flushIce(peer) {
    peer.remoteSet = true;
    const queued = peer.pending.splice(0);
    for (const candidate of queued) {
      try { await peer.pc.addIceCandidate(candidate); }
      catch (e) { console.debug('[voice] queued ICE candidate rejected', e); }
    }
  }

  async function handleSignal(signal) {
    if (!V.stream || !signal || signal.from === uid) return;
    let payload;
    try { payload = JSON.parse(signal.data); }
    catch (e) { return; }

    if (signal.kind === 'offer') {
      // The lower UID is the sole offerer. Ignore stale/glare offers from the wrong side.
      if (uid < signal.from) return;
      const existing = V.peers.get(signal.from);
      if (existing && existing.pc.signalingState !== 'stable') return;
      closePeer(signal.from);
      const peer = createPeer(signal.from);
      await peer.pc.setRemoteDescription(payload);
      await flushIce(peer);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      await send(signal.from, 'answer', peer.pc.localDescription);
      return;
    }

    const peer = V.peers.get(signal.from);
    if (!peer) return;
    if (signal.kind === 'answer' && peer.pc.signalingState === 'have-local-offer') {
      await peer.pc.setRemoteDescription(payload);
      await flushIce(peer);
    } else if (signal.kind === 'ice') {
      if (peer.remoteSet) {
        try { await peer.pc.addIceCandidate(payload); }
        catch (e) { console.debug('[voice] ICE candidate rejected', e); }
      } else {
        peer.pending.push(payload);
      }
    }
  }

  async function sync() {
    if (!V.stream || V.stopped) return;
    const players = getPlayers();
    const inVoice = new Set(players.filter(player => player.voice && player.uid !== uid).map(player => player.uid));

    for (const peerUid of [...V.peers.keys()]) {
      if (!inVoice.has(peerUid)) closePeer(peerUid);
    }
    for (const peerUid of inVoice) {
      if (V.peers.has(peerUid) || uid > peerUid) continue;
      const peer = createPeer(peerUid);
      try {
        await peer.pc.setLocalDescription(await peer.pc.createOffer());
        await send(peerUid, 'offer', peer.pc.localDescription);
      } catch (e) {
        console.warn('[voice] offer failed', e);
        closePeer(peerUid);
      }
    }
  }

  function listen() {
    if (V.unsub) V.unsub();
    V.unsub = fs.onSnapshot(
      fs.query(signals, fs.where('to', '==', uid)),
      snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const signal = change.doc.data();
          const at = signal.at && signal.at.toMillis ? signal.at.toMillis() : Date.now();
          // Copy the payload before deleting the one-time signaling document.
          fs.deleteDoc(change.doc.ref).catch(e => console.debug('[voice] signal cleanup failed', e));
          if (Date.now() - at > STALE_SIGNAL_MS) return;
          handleSignal(signal).catch(e => {
            console.warn('[voice] signal handling failed', e);
            report('A voice connection could not be completed. Reconnecting…');
          });
        });
      },
      error => {
        console.warn('[voice] signaling listener failed', error);
        report('Voice signaling disconnected. Check your connection.');
      }
    );
  }

  async function resumePlayback() {
    if (V.ctx && V.ctx.state === 'suspended') {
      try { await V.ctx.resume(); } catch (e) {}
    }
    audioHost.querySelectorAll('audio').forEach(audio => {
      if (audio.srcObject) audio.play().catch(() => {});
    });
  }

  async function start() {
    if (V.live) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser cannot use the microphone. Open the room over HTTPS and try again.');
    }
    V.stopped = false;
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
        video: false
      });
    } catch (error) {
      const message = error && error.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow microphone access in your browser settings.'
        : error && error.name === 'NotFoundError'
          ? 'No microphone was found on this device.'
          : 'Could not start the microphone. Check microphone permission and try again.';
      throw new Error(message);
    }

    try {
      await setVoice(true);
    } catch (error) {
      V.stream.getTracks().forEach(track => track.stop());
      V.stream = null;
      throw error;
    }

    V.live = true;
    V.muted = false;
    V.stream.getAudioTracks().forEach(track => { track.enabled = true; });
    meter(uid, V.stream);
    startMeters();
    listen();
    V.timer = setInterval(sync, SYNC_INTERVAL_MS);
    emit();
    await resumePlayback();
    await sync();
  }

  function toggleMute() {
    if (!V.live) return;
    V.muted = !V.muted;
    V.stream.getAudioTracks().forEach(track => { track.enabled = !V.muted; });
    emit();
  }

  async function toggle() {
    if (!V.live) await start();
    else {
      await resumePlayback();
      toggleMute();
    }
  }

  function stop() {
    V.stopped = true;
    clearInterval(V.timer);
    clearInterval(V.speakTimer);
    V.timer = null;
    V.speakTimer = null;
    if (V.unsub) { V.unsub(); V.unsub = null; }
    [...V.peers.keys()].forEach(closePeer);
    if (V.stream) V.stream.getTracks().forEach(track => track.stop());
    if (V.ctx) V.ctx.close().catch(() => {});
    V.stream = null;
    V.live = false;
    V.muted = true;
    V.ctx = null;
    V.meters.clear();
    if (onSpeaking) onSpeaking(new Set());
    emit();
  }

  return { toggle, sync, stop, state };
}
