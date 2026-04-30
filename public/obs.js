(function () {
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  if (!roomId) {
    document.body.innerHTML = '<div style="color:#f55;text-align:center;padding:40px">Missing room parameter. Open from host page.</div>';
    return;
  }

  const video = document.getElementById('video');
  const help = document.getElementById('help');

  let fit = params.get('fit') || 'cover';
  let mirror = params.get('mirror') === 'true';

  function applyStyle() {
    video.className = `fit-${fit}${mirror ? ' mirror' : ''}`;
  }

  applyStyle();

  let myId = null;
  let pc = null;

  const ws = connectSignaling(roomId, 'receiver', {
    welcome(msg) {
      myId = msg.clientId;
    },
    'peer-joined'(msg) {
      if (msg.role === 'phone') {
      }
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
