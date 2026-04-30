(function () {
  const params = new URLSearchParams(location.search);
  let roomId = params.get('room');
  if (!roomId) {
    roomId = Math.random().toString(36).substring(2, 8);
    history.replaceState(null, '', `/host?room=${roomId}`);
  }

  let publicUrl = null;

  document.getElementById('room-id').textContent = roomId;

  const statusEl = document.getElementById('status');
  const tunnelText = document.getElementById('tunnel-text');
  const videoEl = document.getElementById('video');

  function setStatus(text, className) {
    statusEl.textContent = text;
    statusEl.className = className || '';
  }

  function setTunnelStatus(text, className) {
    tunnelText.textContent = text;
    tunnelText.className = className || '';
  }

  setTunnelStatus('Connecting...');

  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      publicUrl = cfg.publicUrl;
      const baseUrl = publicUrl || cfg.localUrl;

      const phoneUrl = new URL(`/phone?room=${roomId}`, baseUrl).toString();
      const obsUrl = new URL(`/obs?room=${roomId}`, baseUrl).toString();

      document.getElementById('phone-url').textContent = phoneUrl;
      document.getElementById('obs-url').textContent = obsUrl;

      if (cfg.publicUrl) {
        setTunnelStatus(cfg.publicUrl, 'ok');
      } else {
        setTunnelStatus('Not available (HTTPS may be needed for phone)', 'warn');
      }

      fetch(`/api/qr?url=${encodeURIComponent(phoneUrl)}`)
        .then((r) => r.json())
        .then((d) => {
          document.getElementById('qr').innerHTML = `<img src="${d.dataUrl}" alt="QR Code for phone">`;
        })
        .catch(() => {});

      document.getElementById('copy-link').onclick = () => {
        navigator.clipboard.writeText(phoneUrl).catch(() => {});
      };

      document.getElementById('copy-obs-link').onclick = () => {
        navigator.clipboard.writeText(obsUrl).catch(() => {});
      };

      document.getElementById('open-obs').onclick = () => {
        window.open(obsUrl, '_blank');
      };
    })
    .catch(() => {
      setTunnelStatus('Failed to load config', 'warn');
    });

  fetch('/api/lan-urls')
    .then((r) => r.json())
    .then((data) => {
      const el = document.getElementById('lan-urls');
      if (data.urls && data.urls.length > 0) {
        const links = data.urls
          .map(
            (ip) =>
              `<div>http://${ip}:${location.port}/host?room=${roomId}</div>` +
              `<div>http://${ip}:${location.port}/phone?room=${roomId}</div>`
          )
          .join('');
        el.innerHTML = `<h3>LAN URLs</h3>${links}`;
      }
    })
    .catch(() => {});

  let myId = null;
  let pc = null;
  let ws = null;

  const obsState = { fit: 'contain', mirror: false, rotate: 0 };

  function sendObsSettings() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'obs-settings-update',
        room: roomId,
        settings: { fit: obsState.fit, mirror: obsState.mirror, rotate: obsState.rotate }
      }));
    }
  }

  function updateObsControlsUI() {
    document.querySelectorAll('.obs-fit-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.fit === obsState.fit);
    });
    document.querySelectorAll('.obs-rotate-btn').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.rotate) === obsState.rotate);
    });
    const mirrorBtn = document.getElementById('obs-mirror-btn');
    mirrorBtn.textContent = obsState.mirror ? 'On' : 'Off';
    mirrorBtn.classList.toggle('active', obsState.mirror);
    mirrorBtn.dataset.mirror = obsState.mirror ? 'true' : 'false';
  }

  document.querySelectorAll('.obs-fit-btn').forEach((btn) => {
    btn.onclick = () => {
      obsState.fit = btn.dataset.fit;
      updateObsControlsUI();
      sendObsSettings();
    };
  });

  document.querySelectorAll('.obs-rotate-btn').forEach((btn) => {
    btn.onclick = () => {
      obsState.rotate = parseInt(btn.dataset.rotate);
      updateObsControlsUI();
      sendObsSettings();
    };
  });

  document.getElementById('obs-mirror-btn').onclick = function () {
    obsState.mirror = !obsState.mirror;
    updateObsControlsUI();
    sendObsSettings();
  };

  document.getElementById('obs-reset').onclick = () => {
    obsState.fit = 'contain';
    obsState.mirror = false;
    obsState.rotate = 0;
    updateObsControlsUI();
    sendObsSettings();
  };

  function connectSignaling() {
    if (ws) {
      ws.onclose = null;
      ws.close();
    }

    ws = connectSignaling(roomId, 'receiver', {
      welcome(msg) {
        myId = msg.clientId;
        setStatus('Waiting for phone...', '');
      },
      'peer-joined'(msg) {
        if (msg.role === 'phone') {
          setStatus('Phone connected', 'connected');
        }
      },
      'obs-settings-current'(msg) {
        const s = msg.settings;
        if (s.fit !== undefined) obsState.fit = s.fit;
        if (s.mirror !== undefined) obsState.mirror = s.mirror;
        if (s.rotate !== undefined) obsState.rotate = s.rotate;
        updateObsControlsUI();
      },
      offer(msg) {
        if (pc) {
          pc.close();
          pc = null;
        }
        pc = createPeerConnection();
        pc.ontrack = (e) => {
          videoEl.srcObject = e.streams[0];
          setStatus('Streaming', 'streaming');
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            ws.send(JSON.stringify({
              type: 'ice', room: roomId, from: myId, to: msg.from, candidate: e.candidate
            }));
          }
        };
        pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          .then(() => pc.createAnswer())
          .then((answer) => {
            pc.setLocalDescription(answer);
            ws.send(JSON.stringify({
              type: 'answer', room: roomId, from: myId, to: msg.from, sdp: answer
            }));
          });
      },
      ice(msg) {
        if (pc) pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
      },
      'peer-left'() {
        if (pc) { pc.close(); pc = null; }
        videoEl.srcObject = null;
        setStatus('Disconnected', 'error');
      },
      close() {
        setStatus('Connection lost', 'error');
      }
    });
  }

  connectSignaling();

  document.getElementById('new-room').onclick = () => {
    const newRoom = Math.random().toString(36).substring(2, 8);
    location.href = `/host?room=${newRoom}`;
  };
})();
