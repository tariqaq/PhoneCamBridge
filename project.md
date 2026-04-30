# PhoneCamBridge — OpenCode Project Spec

Build a cross-platform LAN webapp that turns an Android/iPhone camera into a video-only OBS source. The app runs on Windows/Linux/macOS with Node.js. It does NOT create a virtual camera itself; OBS Virtual Camera handles that.

## Hard Requirements

- Video only. Never request microphone permission.
- Use WebRTC for phone → host video streaming.
- Use WebSocket only for signaling.
- Use QR code so phone can join easily.
- Must run on Windows 11 and Linux.
- No database.
- No native drivers.
- No Electron.
- No paid services.
- LAN-first.
- Keep code simple and readable.
- Provide full README with setup and troubleshooting.

## Tech Stack

Use:
- Node.js
- Express
- ws WebSocket package
- qrcode package
- Vanilla HTML/CSS/JS

Do not use React unless absolutely necessary.

## Commands

The finished project must support:

```bash
npm install
npm run dev
```

Server should default to:

```txt
http://0.0.0.0:3000
```

Allow port override:

```bash
PORT=8080 npm run dev
```

## Project Structure

Create this structure:

```txt
phonecambridge/
  package.json
  README.md
  server.js
  public/
    host.html
    phone.html
    obs.html
    styles.css
    host.js
    phone.js
    obs.js
    shared.js
```

## Routes

### GET /

Redirect to `/host`.

### GET /host

Main desktop/laptop control page.

Features:
- Create or reuse a random room ID.
- Show phone join URL.
- Show QR code for phone join URL.
- Show connection status:
  - waiting for phone
  - phone connected
  - streaming
  - disconnected
- Show received remote video preview.
- Buttons:
  - copy phone link
  - open OBS view
  - new room
- Show detected LAN URLs if possible.
- Must work on Windows and Linux.

### GET /phone?room=ROOM_ID

Phone sender page.

Features:
- Ask for camera permission only.
- Use rear camera by default.
- Show local preview.
- Send only the video track over WebRTC.
- Buttons:
  - start camera
  - switch camera if possible
  - reconnect
- Must never request audio.

Use this exact style of constraint:

```js
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 }
  },
  audio: false
});
```

When adding tracks:

```js
for (const track of stream.getVideoTracks()) {
  pc.addTrack(track, stream);
}
```

Do not add audio tracks.

### GET /obs?room=ROOM_ID

OBS capture page.

Features:
- Fullscreen black background.
- Displays received video only.
- No visible controls by default.
- Designed for OBS Browser Source or Window Capture.
- Video should support query params:
  - `fit=cover`
  - `fit=contain`
  - `mirror=true`
  - `mirror=false`

Example:

```txt
/obs?room=abc123&fit=cover&mirror=false
```

Keyboard shortcuts:
- `f` toggles cover/contain.
- `m` toggles mirror.
- `h` toggles minimal help overlay.

## WebRTC Design

Use one room with up to:
- one phone sender
- multiple receivers allowed if easy, but at least host + obs should both work

Simplest acceptable design:
- host page receives stream
- obs page can also receive stream as another receiver
- phone creates separate RTCPeerConnection per receiver

Signaling messages through WebSocket JSON:

```ts
type Message =
  | { type: "join"; room: string; role: "phone" | "receiver"; clientId?: string }
  | { type: "peer-joined"; peerId: string; role: string }
  | { type: "offer"; room: string; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; room: string; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; room: string; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "peer-left"; peerId: string };
```

Server responsibilities:
- assign each WebSocket a client ID
- track rooms in memory
- relay offer/answer/ice to target client
- notify peers when someone joins/leaves
- clean rooms on disconnect
- no auth needed for MVP

Client WebRTC:
- Use `RTCPeerConnection`.
- Use public STUN server for LAN/NAT help:

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});
```

- On `icecandidate`, send candidate through signaling.
- On receiver `track`, attach stream to video element.
- On phone, create offer for each receiver.
- On receiver, answer offer.

## LAN URL Detection

Server should detect IPv4 LAN addresses from Node `os.networkInterfaces()`.

Ignore:
- internal interfaces
- IPv6
- Docker/VM interfaces if obviously named docker, veth, vmware, virtualbox, wsl

Show user possible URLs like:

```txt
http://192.168.1.23:3000/host
http://192.168.1.23:3000/phone?room=abc123
```

## HTTPS Note

Implement HTTP only for MVP, but README must explain:

- Mobile browsers usually require secure context for camera access.
- `localhost` is treated specially, but phone accessing PC LAN IP may need HTTPS depending on browser/device.
- If camera permission fails on phone, use HTTPS via mkcert or a tunnel.
- Include mkcert instructions as optional.

Optional bonus:
- Add `npm run dev:https` using local cert files if simple.
- Do not overcomplicate.

## UI Requirements

Simple dark UI.

Use:
- large QR code
- big status text
- responsive layout
- video preview with rounded corners
- readable error messages
- no external frontend CDN if avoidable

OBS page must be clean:
- black background
- video fills viewport
- no borders unless help overlay shown

## Error Handling

Show clear errors for:
- camera permission denied
- no camera found
- WebSocket disconnected
- room missing
- WebRTC failed
- phone/PC not on same WiFi
- insecure context / camera API unavailable

Detect camera API unavailable:

```js
if (!navigator.mediaDevices?.getUserMedia) {
  showError("Camera API unavailable. Use HTTPS or a supported browser.");
}
```

## README Requirements

README must include:

### What it does

Phone camera streams to PC browser. OBS captures the PC browser page. OBS Virtual Camera exposes it to apps.

### What it does not do

- Does not stream microphone.
- Does not create a virtual camera device by itself.
- Does not work over the public internet unless user sets up HTTPS/tunnel/VPN.
- Does not bypass browser permission prompts.

### Windows setup

1. Install Node.js LTS.
2. Install OBS Studio.
3. Clone/open project.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open shown `/host` URL.
7. Scan QR with phone.
8. In OBS, add Browser Source or Window Capture for `/obs?room=...`.
9. Click Start Virtual Camera.
10. Select OBS Virtual Camera in Discord/Zoom/Meet.

### Linux setup

Debian/Ubuntu example:

```bash
sudo apt update
sudo apt install nodejs npm obs-studio v4l2loopback-dkms v4l2loopback-utils
npm install
npm run dev
```

If OBS Virtual Camera fails:

```bash
sudo modprobe v4l2loopback
```

If apps cannot detect the virtual camera:

```bash
sudo modprobe -r v4l2loopback
sudo modprobe v4l2loopback exclusive_caps=1 card_label="OBS Virtual Camera"
```

Then:
1. Open OBS.
2. Add Browser Source or Window Capture for `/obs?room=...`.
3. Start Virtual Camera.
4. Select OBS Virtual Camera in the target app.

### Firewall troubleshooting

- Allow Node.js through Windows Firewall.
- On Linux, allow port 3000 if firewall is enabled.
- Make sure phone and PC are on same WiFi.
- Disable VPN temporarily if LAN routing fails.

### Phone troubleshooting

- Use Chrome/Edge on Android.
- Use Safari/Chrome on iPhone.
- If permission does not appear, use HTTPS.
- If black screen, refresh phone page and host page.
- Try `fit=contain` if video is cropped.

## Acceptance Tests

After implementation, these must pass:

1. `npm install` succeeds.
2. `npm run dev` starts server.
3. `/host` loads and shows QR code.
4. Phone can open `/phone?room=...`.
5. Phone page requests camera only, not mic.
6. Phone local preview works.
7. Host page receives live video.
8. `/obs?room=...` receives same live video.
9. `/obs?room=...&fit=cover&mirror=true` works.
10. OBS can capture `/obs` page.
11. README includes Windows and Linux setup.
12. No native driver or OS-specific app code is used.

## Implementation Notes

Prefer simple, robust code over clever abstractions.

Use these package scripts:

```json
{
  "scripts": {
    "dev": "node server.js",
    "start": "node server.js"
  }
}
```

Use dependency versions compatible with current Node LTS.

## Final Response Expected From OpenCode

When done, output only:
- created files list
- run commands
- short testing checklist
- any known limitation
