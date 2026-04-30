(function () {
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  if (!roomId) {
    showError('No room ID provided. Scan QR code from host page.');
    return;
  }

  const statusEl = document.getElementById('status');
  const localVideo = document.getElementById('local-video');
  const errorEl = document.getElementById('error');
  const startBtn = document.getElementById('start-camera');
  const switchBtn = document.getElementById('switch-camera');
  const reconnectBtn = document.getElementById('reconnect');

  let myId = null;
  let ws = null;
  let localStream = null;
  const pcMap = {};
  let pendingReceivers = [];
  let currentFacing = 'environment';

  function setStatus(text, className) {
    statusEl.textContent = text;
    statusEl.className = className || '';
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.className = 'show';
  }

  function hideError() {
    errorEl.textContent = '';
    errorEl.className = '';
  }

  function getVideoStream(facing) {
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });
  }

  async function startCamera(facing) {
    hideError();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('Camera API unavailable. Use HTTPS or a supported browser.');
      return null;
    }
    try {
      const stream = await getVideoStream(facing);
      localVideo.srcObject = stream;
      localVideo.style.display = 'block';
      switchBtn.disabled = false;
      startBtn.textContent = 'Camera Started';
      startBtn.disabled = true;
      return stream;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showError('Camera permission denied. Allow camera access and try again.');
      } else if (err.name === 'NotFoundError') {
        showError('No camera found on this device.');
      } else {
        showError(`Camera error: ${err.message}`);
      }
      return null;
    }
  }

  async function switchCamera() {
    const stream = localStream;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
    const newStream = await startCamera(currentFacing);
    if (!newStream) {
      currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
      return;
    }
    localStream = newStream;
    const videoTrack = newStream.getVideoTracks()[0];
    if (videoTrack) {
      for (const pc of Object.values(pcMap)) {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }
    }
  }

  function createPCForReceiver(peerId) {
    if (pcMap[peerId]) return;
    if (!localStream) {
      pendingReceivers.push(peerId);
      return;
    }
    const pc = createPeerConnection();
    pcMap[peerId] = pc;
    for (const track of localStream.getVideoTracks()) {
      pc.addTrack(track, localStream);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'ice', room: roomId, from: myId, to: peerId, candidate: e.candidate
        }));
      }
    };
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'closed') {
        delete pcMap[peerId];
      }
    };
    pc.createOffer()
      .then((offer) => {
        pc.setLocalDescription(offer);
        ws.send(JSON.stringify({
          type: 'offer', room: roomId, from: myId, to: peerId, sdp: offer
        }));
      });
  }

  function connect() {
    hideError();
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    for (const id of Object.keys(pcMap)) {
      pcMap[id].close();
      delete pcMap[id];
    }
    pendingReceivers = [];

    ws = connectSignaling(roomId, 'phone', {
      welcome(msg) {
        myId = msg.clientId;
        setStatus('Connected to room', 'connected');
      },
      'peer-joined'(msg) {
        if (msg.role === 'receiver') {
          createPCForReceiver(msg.peerId);
        }
      },
      answer(msg) {
        const pc = pcMap[msg.from];
        if (pc) {
          pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch(() => {});
        }
      },
      ice(msg) {
        const pc = pcMap[msg.from];
        if (pc) {
          pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
        }
      },
      'peer-left'(msg) {
        const pc = pcMap[msg.peerId];
        if (pc) {
          pc.close();
          delete pcMap[msg.peerId];
        }
      },
      close() {
        setStatus('Disconnected from server', 'error');
        showError('WebSocket disconnected. Check your connection and try reconnecting.');
      }
    });
  }

  startBtn.onclick = async () => {
    const stream = await startCamera(currentFacing);
    if (stream) {
      localStream = stream;
      const receivers = pendingReceivers.slice();
      pendingReceivers = [];
      for (const peerId of receivers) {
        createPCForReceiver(peerId);
      }
    }
  };

  switchBtn.onclick = switchCamera;
  reconnectBtn.onclick = connect;

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    connect();
  } else {
    showError('Camera API unavailable. Use HTTPS or a supported browser.');
  }
})();
