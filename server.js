const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const localtunnel = require('localtunnel');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const serverConfig = {
  localUrl: null,
  publicUrl: null,
  usingTunnel: false
};

app.get('/', (req, res) => {
  res.redirect('/host');
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/phone', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'phone.html'));
});

app.get('/obs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'obs.html'));
});

app.get('/api/config', (req, res) => {
  res.json(serverConfig);
});

app.get('/api/qr', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'Missing url' });
    const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
    res.json({ dataUrl });
  } catch {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

app.get('/api/lan-urls', (req, res) => {
  res.json({ urls: getLANUrls() });
});

const rooms = {};

function getLANUrls() {
  const urls = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (/docker|veth|vmware|virtualbox|wsl/i.test(name)) continue;
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        urls.push(iface.address);
      }
    }
  }
  return urls;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

wss.on('connection', (ws) => {
  const clientId = generateId();
  ws.clientId = clientId;
  ws.room = null;
  ws.role = null;

  ws.send(JSON.stringify({ type: 'welcome', clientId }));

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join':
        handleJoin(ws, msg);
        break;
      case 'offer':
      case 'answer':
      case 'ice':
        handleRelay(ws, msg);
        break;
      case 'obs-settings-update':
        handleObsSettingsUpdate(ws, msg);
        break;
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

function handleJoin(ws, msg) {
  const { room, role } = msg;
  if (!room || !role) return;

  ws.room = room;
  ws.role = role;

  if (!rooms[room]) {
    rooms[room] = {};
  }

  rooms[room][ws.clientId] = { ws, role };

  for (const [id, client] of Object.entries(rooms[room])) {
    if (id !== ws.clientId) {
      client.ws.send(JSON.stringify({
        type: 'peer-joined',
        peerId: ws.clientId,
        role
      }));
      ws.send(JSON.stringify({
        type: 'peer-joined',
        peerId: id,
        role: client.role
      }));
    }
  }

  if (role === 'receiver' && rooms[room].obsSettings) {
    ws.send(JSON.stringify({
      type: 'obs-settings-current',
      settings: rooms[room].obsSettings
    }));
  }
}

function handleRelay(ws, msg) {
  const { room, to } = msg;
  if (!room || !to || !rooms[room]) return;
  if (!rooms[room][ws.clientId]) return;
  const target = rooms[room][to];
  if (target) {
    target.ws.send(JSON.stringify(msg));
  }
}

function handleObsSettingsUpdate(ws, msg) {
  const { room, settings } = msg;
  if (!room || !settings || !rooms[room]) return;

  rooms[room].obsSettings = settings;

  for (const [id, client] of Object.entries(rooms[room])) {
    if (id !== ws.clientId && client.role === 'receiver') {
      client.ws.send(JSON.stringify({
        type: 'obs-settings-update',
        settings
      }));
    }
  }
}

function handleDisconnect(ws) {
  const { room, clientId } = ws;
  if (room && rooms[room]) {
    delete rooms[room][clientId];
    if (Object.keys(rooms[room]).length === 0) {
      delete rooms[room];
    } else {
      const leftMsg = JSON.stringify({ type: 'peer-left', peerId: clientId });
      for (const client of Object.values(rooms[room])) {
        client.ws.send(leftMsg);
      }
    }
  }
}

async function startTunnel(port) {
  try {
    const tunnel = await localtunnel({ port });
    serverConfig.publicUrl = tunnel.url.replace(/\/$/, '');
    serverConfig.usingTunnel = true;
    console.log(`\nTunnel URL: ${serverConfig.publicUrl}/host`);
    console.log(`Phone URL: ${serverConfig.publicUrl}/phone?room=ROOM_ID`);
    console.log(`OBS URL: ${serverConfig.publicUrl}/obs?room=ROOM_ID`);

    tunnel.on('close', () => {
      serverConfig.publicUrl = null;
      serverConfig.usingTunnel = false;
      console.log('\nTunnel closed.');
    });
  } catch (err) {
    console.log(`\nTunnel failed: ${err.message}`);
    console.log('Phone camera may require HTTPS for camera access.');
    console.log('See README for HTTPS setup alternatives.');
  }
}

const PORT = process.env.PORT || 3000;
serverConfig.localUrl = `http://localhost:${PORT}`;

server.listen(PORT, '0.0.0.0', () => {
  const lanUrls = getLANUrls();
  console.log(`PhoneCamBridge running at http://0.0.0.0:${PORT}`);
  if (lanUrls.length > 0) {
    console.log('LAN URLs:');
    for (const ip of lanUrls) {
      console.log(`  http://${ip}:${PORT}/host`);
    }
  }
  console.log(`  http://localhost:${PORT}/host`);

  startTunnel(PORT);
});
