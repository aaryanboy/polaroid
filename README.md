# Same Sky

A two-person photo booth for long-distance couples. One person starts a session
and gets a short code; the other enters it. Cameras connect peer-to-peer
(WebRTC via PeerJS), you pick a frame together, then either person taps
"Capture together" — both sides get a synced 3-2-1 countdown and land on the
same eclipse-style photo, ready to download.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 on two devices/browsers (or two people, two places)
and test it out. Camera access requires either `localhost` or HTTPS, so for a
real long-distance test you'll want to deploy it (Vercel works great and is
free for this) rather than share a raw local URL.

## How it works

- **Pairing**: PeerJS's free public signaling broker is used to establish a
  direct WebRTC connection between the two browsers — no backend needed.
- **Frame picker & countdown sync**: sent over a WebRTC data channel so both
  sides see the same frame choice and start their countdown at the same
  target timestamp.
- **The photo**: each browser draws its own local video feed + the partner's
  video feed onto a `<canvas>` in the "eclipse" layout, applies the chosen
  border/caption, and exports a PNG — no server-side image processing.

## Notes / next steps if you want to extend it

- Swap the PeerJS public broker for your own PeerServer if you want more
  reliability at scale.
- Add a TURN server (e.g. via Twilio or metered.ca) for people on strict
  NATs/corporate networks where the direct P2P connection fails.
- Persist favorite photos or a shared gallery with a small database.
