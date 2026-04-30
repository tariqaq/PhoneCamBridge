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

Open `http://localhost:3000/host` on your PC.

Scan the QR code with your phone.

In OBS, add a Browser Source pointing to the OBS URL shown on the host page, or use Window Capture.

### Windows

1. Install [Node.js LTS](https://nodejs.org/).
2. Install [OBS Studio](https://obsproject.com/).
3. Clone or download this project.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open `http://localhost:3000/host` in a browser.
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

## OBS View

The OBS page at `/obs?room=ROOM_ID` is designed for Browser Source capture. It supports query parameters:

- `fit=cover` (default) - video covers the viewport.
- `fit=contain` - video fits within the viewport.
- `mirror=true` - horizontally mirror the video.

Example: `/obs?room=abc123&fit=cover&mirror=false`

Keyboard shortcuts on the OBS page:
- `f` - toggle fit between cover and contain.
- `m` - toggle mirror.
- `h` - toggle help overlay.

## HTTPS (if needed)

Mobile browsers often require a secure context for camera access. `localhost` works without HTTPS, but if your phone accesses the PC by LAN IP, you may need HTTPS.

### Using mkcert

```bash
# Install mkcert (one time)
# Windows: choco install mkcert
# Linux: sudo apt install mkcert  or  brew install mkcert

mkcert -install
mkdir certs
cd certs
mkcert 0.0.0.0 localhost 192.168.x.x  # replace with your LAN IP
cd ..
```

Then run with HTTPS:

```bash
npm install
node server.js --https
```

### Using a tunnel

Use ngrok, bore, or similar:

```bash
ngrok http 3000
```

Then open the ngrok URL on your phone.

## Firewall troubleshooting

- Allow Node.js through Windows Firewall.
- On Linux, allow port 3000 if firewall is enabled (`sudo ufw allow 3000`).
- Make sure phone and PC are on the same WiFi network.
- Disable VPN temporarily if LAN routing fails.

## Phone troubleshooting

- Use Chrome/Edge on Android.
- Use Safari/Chrome on iPhone.
- If camera permission does not appear, use HTTPS.
- If the video shows black, refresh both phone and host pages.
- Try `fit=contain` if the video is cropped on the OBS page.
- Ensure the phone has rear camera available.

## OBS Browser Source settings

Recommended settings for the Browser Source:

- Width: 1920
- Height: 1080
- Control audio via OBS: unchecked (no audio stream)
- Refresh browser when scene becomes active: recommended

## Architecture

PhoneCamBridge uses WebRTC for browser-to-browser video streaming. Signaling is handled via WebSocket. No data is sent through external servers beyond the initial STUN lookup.

- Phone: captures camera, sends video track via WebRTC.
- Host PC: receives video, shows preview, generates QR code.
- OBS page: receives the same video stream for OBS capture.
- All communication stays on your LAN.
