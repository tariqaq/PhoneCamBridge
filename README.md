# PhoneCamBridge

Turn your phone camera into a video-only OBS source over LAN.

Phone camera streams to PC browser. OBS captures the PC browser page. OBS Virtual Camera exposes it to apps.

## What it does not do

- Does not stream microphone.
- Does not create a virtual camera device by itself.
- Does not work over the public internet unless user sets up HTTPS/tunnel/VPN.
- Does not bypass browser permission prompts.

## Setup

### Quick start

```bash
npm install
npm run dev
```

The app automatically starts a LocalTunnel so your phone camera works over HTTPS.

Open the printed tunnel URL (or `http://localhost:3000/host`) on your PC.

Scan the QR code with your phone.

In OBS, add a Browser Source pointing to the OBS URL shown on the host page.

### Windows

1. Install [Node.js LTS](https://nodejs.org/).
2. Install [OBS Studio](https://obsproject.com/).
3. Clone or download this project.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open the printed tunnel `/host` URL (or `http://localhost:3000/host`) in a browser.
7. Scan the QR code with your phone.
8. In OBS, add a Browser Source or Window Capture for `/obs?room=...`.
9. Click Start Virtual Camera in OBS.
10. Select OBS Virtual Camera in your target app (Discord, Zoom, Meet, etc.).

### Linux (Debian/Ubuntu)

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

### Port override

```bash
PORT=8080 npm run dev
```

## How it works

1. Run `npm run dev` — the app starts a local server and automatically creates a LocalTunnel.
2. The terminal prints the local URL and the tunnel URL.
3. Open the tunnel `/host` URL on your PC — it shows a room ID, QR code, phone link, and OBS link.
4. Scan the QR code with your phone — opens the tunnel `/phone` page over HTTPS.
5. Phone camera works because LocalTunnel provides HTTPS.
6. On `/host`, use the **OBS View Controls** section to adjust fit, mirror, and rotation.
7. Open `/obs?room=ROOM_ID` in OBS Browser Source — it receives the video and applies host controls live.

## OBS View Controls (on /host)

The host page has an **OBS View Controls** section that updates the OBS page live through WebSocket.

**Fit:**
- `contain` — video fits entirely within the viewport (letterboxed).
- `cover` — video fills the viewport (may crop).

**Mirror:**
- Toggle horizontal mirror on/off.

**Rotate:**
- Rotate the video 0°, 90° clockwise, 180°, or 270°.

**Reset:**
- Returns to contain + mirror off + 0°.

Controls apply immediately to the OBS page. No refresh needed.

## OBS page

The OBS page at `/obs?room=ROOM_ID` is designed for Browser Source capture.

Query parameters work as fallback defaults (overridden by host controls once received):
- `fit=cover` or `fit=contain`
- `mirror=true` or `mirror=false`
- `rotate=0`, `90`, `180`, or `270`

Example with all params:

```
https://SUBDOMAIN.loca.lt/obs?room=ROOM_ID&fit=contain&rotate=90&mirror=true
```

Keyboard shortcuts on the OBS page:
- `f` — toggle fit between cover and contain.
- `m` — toggle mirror.
- `h` — toggle help overlay.

### Rotation notes

- Use `rotate=90` when the phone is held vertically and you want the video to fill a landscape OBS canvas.
- `rotate=180` for upside-down mounting.
- `fit=contain` avoids cropping.
- `fit=cover` may crop intentionally to fill the viewport.

## Phone camera / lens switching

The `/phone` page shows all cameras/lenses exposed by the browser's `enumerateDevices()` API.

Features:
- **Camera selector dropdown** — shows all available `videoinput` devices with friendly labels.
- **Selfie button** — selects the front camera.
- **Back Camera button** — selects the rear/default camera.
- **Next Camera button** — cycles through available cameras.

When switching cameras:
- The video track is replaced on all connected peers using `RTCRtpSender.replaceTrack()`.
- No reconnection needed.
- If `replaceTrack` fails, the connection is recreated automatically.

**Note on lens availability:** Some phones may not expose ultra-wide or telephoto lenses separately. Android Chrome generally exposes more cameras than iPhone Safari. Labels depend on what the browser and device driver expose.

## LocalTunnel

LocalTunnel is automatically started when the server runs.

- The app uses the `localtunnel` npm package, not a CLI tool.
- No manual tunnel setup needed.
- The tunnel URL is printed in the terminal.
- If the tunnel fails, the local server still runs and shows a fallback message.
- Phone camera requires HTTPS; LocalTunnel provides this automatically.

If LocalTunnel shows a password/interstitial page, follow the on-screen instructions (usually just click to confirm).

## OBS Browser Source settings

Recommended settings for the Browser Source:

- Width: 1920
- Height: 1080
- Control audio via OBS: unchecked (no audio stream)
- Refresh browser when scene becomes active: recommended

## Firewall troubleshooting

- Allow Node.js through Windows Firewall.
- On Linux, allow port 3000 if firewall is enabled (`sudo ufw allow 3000`).
- Make sure phone and PC are on the same WiFi network.
- Disable VPN temporarily if LAN routing fails.

## Phone troubleshooting

- Use Chrome/Edge on Android.
- Use Safari/Chrome on iPhone.
- If tunnel is active, camera permission should work over HTTPS.
- If the video shows black, refresh both phone and host pages.
- Try `fit=contain` if the video is cropped on the OBS page.
- Ensure the phone has a camera available.

## Architecture

PhoneCamBridge uses WebRTC for browser-to-browser video streaming. Signaling is handled via WebSocket. No data is sent through external servers beyond the initial STUN lookup.

- Phone: captures camera, sends video track via WebRTC.
- Host PC: receives video, shows preview, generates QR code, controls OBS settings.
- OBS page: receives the same video stream for OBS capture, applies host-controlled settings.
- LocalTunnel: provides HTTPS tunnel for phone camera access in mobile browsers.
- All peer-to-peer video stays on your LAN (WebRTC uses LAN routes when available).

### Tech stack

- Node.js with Express
- ws WebSocket for signaling and OBS controls
- qrcode for QR code generation
- localtunnel for automatic HTTPS tunnel
- Vanilla HTML/CSS/JS on the frontend
- WebRTC for video streaming
