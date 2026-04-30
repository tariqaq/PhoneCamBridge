(function () {
  const params = new URLSearchParams(location.search);
  let roomId = params.get('room');
  if (!roomId) {
    roomId = Math.random().toString(36).substring(2, 8);
    history.replaceState(null, '', `/host?room=${roomId}`);
  }

  const protocol = location.protocol;
  const hostname = location.hostname;
  const port = location.port;
  const phoneUrl = `${protocol}//${hostname}:${port}/phone?room=${roomId}`;
  const obsUrl = `/obs?room=${roomId}`;

  document.getElementById('room-id').textContent = roomId;
  document.getElementById('phone-url').textContent = phoneUrl;
  document.getElementById('obs-url').textContent = obsUrl;

  const statusEl = document.getElementById('status');
  const videoEl = document.getElementById('video');

  function setStatus(text, className) {
    statusEl.textContent = text;
    statusEl.className = className || '';
  }

  fetch(`/api/qr?url=${encodeURIComponent(phoneUrl)}`)
    .then((r) => r.json())
    .then((d) => {
      document.getElementById('qr').innerHTML = `<img src="${d.dataUrl}" alt="QR Code for phone">`;
    })
    .catch(() => {});

  fetch('/api/lan-urls')
    .then((r) => r.json())
    .then((data) => {
      const el = document.getElementById('lan-urls');
      if (data.urls && data.urls.length > 0) {
        const links = data.urls
          .map(
            (ip) =>
              `<div>http://${ip}:${port}/host?room=${roomId}</div>` +
              `<div>http://${ip}:${port}/phone?room=${roomId}</div>`
          )
          .join('');
        el.innerHTML = `<h3>LAN URLs</h3>${links}`;
      }
    })
    .catch(() => {});

  let myId = null;
  let pc = null;

  const ws = connectSignaling(roomId, 'receiver', {
    welcome(msg) {
      myId = msg.clientId;
      setStatus('Waiting for phone...', '');
    },
    'peer-joined'(msg) {
      if (msg.role === 'phone') {
        setStatus('Phone connected', 'connected');
      }
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

  document.getElementById('copy-link').onclick = () => {
    navigator.clipboard.writeText(phoneUrl).catch(() => {});
  };

  document.getElementById('open-obs').onclick = () => {
    window.open(obsUrl, '_blank');
  };

  document.getElementById('new-room').onclick = () => {
    const newRoom = Math.random().toString(36).substring(2, 8);
    location.href = `/host?room=${newRoom}`;
  };
})();
