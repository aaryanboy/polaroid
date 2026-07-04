# Same Sky

A two-person photo booth for long-distance couples. One person starts a session
and gets a short code; the other enters it. Cameras connect peer-to-peer over
WebRTC — signaled through your own small Socket.io server — then you pick a
frame together and either person taps "Capture together" for a synced 3-2-1
countdown that lands on the same eclipse-style photo, downloadable on both
sides.

This project has two parts that deploy separately:

```
sync-booth/
├── app/            ← the Next.js app (deploy to Vercel)
└── server/         ← the Socket.io signaling server (deploy to Render/Railway/Fly)
```

The signaling server can't run on Vercel — it needs a long-lived connection,
and Vercel's functions are request/response only. It's a tiny Node process
though, and free tiers on Render/Railway are plenty for this.

## 1. Run the signaling server

```bash
cd server
npm install
npm start
```

It listens on port 4000 by default (or `PORT` env var). Visit
`http://localhost:4000/health` to confirm it's up — you'll see something like
`{"ok":true,"rooms":[]}`.

To deploy it for real (e.g. on Render):
1. Push this repo to GitHub.
2. On Render: New → Web Service → point at the repo, set root directory to
   `server`, build command `npm install`, start command `npm start`.
3. Copy the `https://your-service.onrender.com` URL it gives you.

## 2. Run the Next.js app

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and set NEXT_PUBLIC_SIGNALING_URL to your server's URL
npm run dev
```

Deploy to Vercel as usual, and set `NEXT_PUBLIC_SIGNALING_URL` as an
environment variable in the Vercel project settings (pointing at your
deployed signaling server, not localhost).

Camera access requires `localhost` or HTTPS — Vercel gives you HTTPS
automatically, so real cross-network testing only works once it's deployed.

## Debug panel

There's a collapsible debug log at the bottom of the screen (tap "▸ debug
log" to open it). It timestamps every step — camera access, socket connect,
role assignment, offer/answer exchange, ICE connection state changes, remote
track arrival — so you can see exactly where things are slow or failing,
even on a phone with no access to the browser console. Key things to watch:

- **"ICE connection state: checking" stuck for a long time, then "failed"**
  → the direct connection couldn't be established (common across strict
  NATs/mobile carriers) and the TURN relay isn't picking it up either.
- **"Socket connection error"** → the app can't reach your signaling server;
  double check `NEXT_PUBLIC_SIGNALING_URL`.
- **"Camera access failed"** → permissions denied or no camera available.

You can also check the signaling server's own logs (in Render's dashboard,
or your terminal in local dev) — every join, role assignment, and relayed
signal is logged there with timestamps too.

## How it works

- **Signaling**: your Socket.io server assigns the first person in a room
  "host" and the second "guest," then relays WebRTC offer/answer/ICE
  messages between them. It never sees the video itself.
- **Media**: once WebRTC negotiates, video flows directly between the two
  browsers (or through the TURN relay if a direct path isn't possible).
- **Frame picker & countdown sync**: sent over a WebRTC data channel so both
  sides see the same frame choice and start their countdown at the same
  target timestamp.
- **The photo**: each browser draws its own local video feed + the partner's
  video feed onto a `<canvas>` in the "eclipse" layout, applies the chosen
  border/caption, and exports a PNG — no server-side image processing.

## Notes

- The TURN server used (`openrelay.metered.ca`) is a free public service
  meant for testing, not guaranteed production reliability. For regular use,
  consider a paid TURN provider (Twilio, metered.ca) with your own
  credentials.
- Rooms are in-memory on the signaling server — if it restarts, active
  sessions are lost (fine for this use case, no persistence needed).
