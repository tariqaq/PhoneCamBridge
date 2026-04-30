function createPeerConnection() {
  return new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
}

function connectSignaling(room, role, handlers) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room, role }));
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const handler = handlers[msg.type];
      if (handler) handler(msg);
    } catch {}
  };
  ws.onclose = () => {
    if (handlers.close) handlers.close();
  };
  ws.onerror = () => {};
  return ws;
}
