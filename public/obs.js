(function () {
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  if (!roomId) {
    document.body.innerHTML = '<div style="color:#f55;text-align:center;padding:40px">Missing room parameter. Open from host page.</div>';
    return;
  }

  const wrap = document.getElementById('obs-video-wrap');
  const video = document.getElementById('video');
  const help = document.getElementById('help');

  let fit = params.get('fit') || 'contain';
  let mirror = params.get('mirror') === 'true';
  let rotate = parseInt(params.get('rotate')) || 0;

  function applyStyle() {
    video.style.objectFit = fit;
    video.classList.toggle('mirror', mirror);

    wrap.style.transform = '';
    wrap.style.width = '';
    wrap.style.height = '';
    wrap.style.top = '';
    wrap.style.left = '';

    if (rotate === 0) {
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.transform = 'none';
    } else if (rotate === 90) {
      wrap.style.width = '100vh';
      wrap.style.height = '100vw';
      wrap.style.left = 'calc((100vw - 100vh) / 2)';
      wrap.style.top = 'calc((100vh - 100vw) / 2)';
      wrap.style.transform = 'rotate(90deg)';
    } else if (rotate === 180) {
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.transform = 'rotate(180deg)';
    } else if (rotate === 270) {
      wrap.style.width = '100vh';
      wrap.style.height = '100vw';
      wrap.style.left = 'calc((100vw - 100vh) / 2)';
      wrap.style.top = 'calc((100vh - 100vw) / 2)';
      wrap.style.transform = 'rotate(270deg)';
    }
  }

  applyStyle();

  let myId = null;
  let pc = null;

  const ws = connectSignaling(roomId, 'receiver', {
    welcome(msg) {
      myId = msg.clientId;
    },
    'obs-settings-current'(msg) {
      const s = msg.settings;
      if (s.fit !== undefined) fit = s.fit;
      if (s.mirror !== undefined) mirror = s.mirror;
      if (s.rotate !== undefined) rotate = s.rotate;
      applyStyle();
    },
    'obs-settings-update'(msg) {
      const s = msg.settings;
      if (s.fit !== undefined) fit = s.fit;
      if (s.mirror !== undefined) mirror = s.mirror;
      if (s.rotate !== undefined) rotate = s.rotate;
      applyStyle();
    },
    offer(msg) {
      if (pc) { pc.close(); pc = null; }
      pc = createPeerConnection();
      pc.ontrack = (e) => {
        video.srcObject = e.streams[0];
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
      video.srcObject = null;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.key.toLowerCase()) {
      case 'f':
        fit = fit === 'cover' ? 'contain' : 'cover';
        applyStyle();
        break;
      case 'm':
        mirror = !mirror;
        applyStyle();
        break;
      case 'h':
        help.style.display = help.style.display === 'none' ? '' : 'none';
        break;
    }
  });
})();
