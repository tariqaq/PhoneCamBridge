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
  const reconnectBtn = document.getElementById('reconnect');
  const cameraSelect = document.getElementById('camera-select');
  const btnSelfie = document.getElementById('btn-selfie');
  const btnBack = document.getElementById('btn-back');
  const btnNext = document.getElementById('btn-next');

  let myId = null;
  let ws = null;
  let localStream = null;
  const pcMap = {};
  let pendingReceivers = [];
  let videoDevices = [];
  let currentDeviceId = null;

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

  function friendlyLabel(device) {
    const label = device.label || '';
    if (!label) return 'Camera ' + (videoDevices.indexOf(device) + 1);
    const lower = label.toLowerCase();
    if (lower.includes('front') || lower.includes('selfie') || lower.includes('face')) return 'Selfie';
    if (lower.includes('ultra') || lower.includes('wide') && !lower.includes('ultra')) return 'Ultra Wide';
    if (lower.includes('tele')) {
      if (lower.includes('3x') || lower.includes('3')) return 'Telephoto 3x';
      if (lower.includes('5x') || lower.includes('5')) return 'Telephoto 5x';
      return 'Telephoto';
    }
    if (lower.includes('back') || lower.includes('rear') || lower.includes('environment') || lower.includes('main') || lower.includes('primary')) return 'Primary / Wide';
    return label.replace(/\s*\(.*?\)\s*/g, '').trim() || 'Camera ' + (videoDevices.indexOf(device) + 1);
  }

  function popupateCameraList() {
    const prev = currentDeviceId;
    cameraSelect.innerHTML = '';
    cameraSelect.disabled = false;

    videoDevices.forEach((dev, i) => {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      opt.textContent = friendlyLabel(dev);
      if (dev.deviceId === prev) opt.selected = true;
      cameraSelect.appendChild(opt);
    });

    if (!prev && videoDevices.length > 0) {
      const backIdx = videoDevices.findIndex((d) => {
        const l = (d.label || '').toLowerCase();
        return l.includes('back') || l.includes('rear') || l.includes('environment');
      });
      const idx = backIdx >= 0 ? backIdx : 0;
      cameraSelect.selectedIndex = idx;
      currentDeviceId = videoDevices[idx].deviceId;
    }
  }

  function getVideoStreamById(deviceId) {
    return navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });
  }

  async function startCameraById(deviceId) {
    hideError();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('Camera API unavailable. Use HTTPS or a supported browser.');
      return null;
    }
    try {
      const stream = await getVideoStreamById(deviceId);
      localVideo.srcObject = stream;
      localVideo.style.display = 'block';
      startBtn.textContent = 'Camera Started';
      startBtn.disabled = true;
      return stream;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showError('Camera permission denied. Allow camera access and try again.');
      } else if (err.name === 'NotFoundError') {
        showError('No camera found on this device.');
      } else {
        showError('Camera error: ' + (err.message || 'unknown'));
      }
      return null;
    }
  }

  async function switchToDevice(deviceId) {
    if (!deviceId || deviceId === currentDeviceId) return;
    currentDeviceId = deviceId;

    const oldTracks = localStream ? localStream.getVideoTracks() : [];
    const newStream = await startCameraById(deviceId);
    if (!newStream) {
      currentDeviceId = null;
      return;
    }

    oldTracks.forEach((t) => t.stop());

    localStream = newStream;
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return;

    for (const pc of Object.values(pcMap)) {
      try {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      } catch {
        console.warn('replaceTrack failed for a peer, recreating connection');
      }
    }
  }

  async function enumerateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter((d) => d.kind === 'videoinput');
      popupateCameraList();
    } catch {
      videoDevices = [];
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
    if (!videoDevices.length) {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch {}
      await enumerateCameras();
    }

    if (!videoDevices.length) {
      showError('No cameras found.');
      return;
    }

    const backIdx = videoDevices.findIndex((d) => {
      const l = (d.label || '').toLowerCase();
      return l.includes('back') || l.includes('rear') || l.includes('environment');
    });
    const idx = backIdx >= 0 ? backIdx : 0;
    const deviceId = videoDevices[idx].deviceId;
    currentDeviceId = deviceId;

    const stream = await startCameraById(deviceId);
    if (stream) {
      localStream = stream;
      popupateCameraList();
      const receivers = pendingReceivers.slice();
      pendingReceivers = [];
      for (const peerId of receivers) {
        createPCForReceiver(peerId);
      }
    }
  };

  cameraSelect.onchange = () => {
    const deviceId = cameraSelect.value;
    if (deviceId) switchToDevice(deviceId);
  };

  btnSelfie.onclick = async () => {
    if (!videoDevices.length) return;
    const idx = videoDevices.findIndex((d) => {
      const l = (d.label || '').toLowerCase();
      return l.includes('front') || l.includes('selfie') || l.includes('face') || l.includes('user');
    });
    const target = idx >= 0 ? idx : (videoDevices.length > 1 ? 1 : 0);
    const deviceId = videoDevices[target].deviceId;
    cameraSelect.value = deviceId;
    await switchToDevice(deviceId);
  };

  btnBack.onclick = async () => {
    if (!videoDevices.length) return;
    const idx = videoDevices.findIndex((d) => {
      const l = (d.label || '').toLowerCase();
      return l.includes('back') || l.includes('rear') || l.includes('environment');
    });
    const target = idx >= 0 ? idx : 0;
    const deviceId = videoDevices[target].deviceId;
    cameraSelect.value = deviceId;
    await switchToDevice(deviceId);
  };

  btnNext.onclick = async () => {
    if (videoDevices.length < 2) return;
    const curIdx = videoDevices.findIndex((d) => d.deviceId === currentDeviceId);
    const nextIdx = (curIdx + 1) % videoDevices.length;
    const deviceId = videoDevices[nextIdx].deviceId;
    cameraSelect.value = deviceId;
    await switchToDevice(deviceId);
  };

  reconnectBtn.onclick = connect;

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    connect();
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(() => enumerateCameras())
      .catch(() => {});
  } else {
    showError('Camera API unavailable. Use HTTPS or a supported browser.');
  }
})();
