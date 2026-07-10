"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Socket } from "socket.io-client";

type Stage = "setup" | "waiting" | "joining" | "live" | "result";
type LogLevel = "info" | "success" | "error";
type LogEntry = { time: string; msg: string; level: LogLevel };

/* ----------------------------------------------------------------------- *
 * Style system: three independent, syncable choices.
 *  - Palette  → color mood (ring / paper / ink / page glow)
 *  - Shape    → the "window" each partner appears in
 *  - Backdrop → the sprinkle drawn behind you both, live and in the photo
 * All three are shared instantly over the WebRTC data channel so both
 * partners always see the same booth.
 * ----------------------------------------------------------------------- */

type PaletteStyle = {
  id: string;
  label: string;
  swatch: string;
  ring: string;
  paper: string;
  ink: string;
  glow: string;
  caption: string;
};

const PALETTES: PaletteStyle[] = [
  {
    id: "eclipse",
    label: "Eclipse",
    swatch: "linear-gradient(135deg,#e8b65a,#ff7a59)",
    ring: "#e8b65a",
    paper: "#f5efe6",
    ink: "#1a1210",
    glow: "radial-gradient(circle at 20% 15%, #3a2b1f 0%, #120d0a 65%)",
    caption: "same sky, two windows",
  },
  {
    id: "midnight",
    label: "Midnight",
    swatch: "linear-gradient(135deg,#2c2a4a,#5b4b8a)",
    ring: "#b9a7ff",
    paper: "#181732",
    ink: "#f5efe6",
    glow: "radial-gradient(circle at 80% 10%, #241f45 0%, #0b0a1a 65%)",
    caption: "miles apart, same moment",
  },
  {
    id: "coral",
    label: "Coral",
    swatch: "linear-gradient(135deg,#ff7a59,#ffb199)",
    ring: "#ff7a59",
    paper: "#fff4ee",
    ink: "#3a2115",
    glow: "radial-gradient(circle at 30% 80%, #4a2418 0%, #1a0f0a 65%)",
    caption: "wish you were here",
  },
  {
    id: "film",
    label: "Film",
    swatch: "linear-gradient(135deg,#3a2b4a,#12131f)",
    ring: "#f5efe6",
    paper: "#12131f",
    ink: "#f5efe6",
    glow: "radial-gradient(circle at 50% 50%, #201c2e 0%, #08070d 65%)",
    caption: "shot from two cities",
  },
  {
    id: "bloom",
    label: "Bloom",
    swatch: "linear-gradient(135deg,#ffb6c9,#ff8fab)",
    ring: "#ff8fab",
    paper: "#fff0f4",
    ink: "#4a1f2b",
    glow: "radial-gradient(circle at 40% 20%, #3a1a26 0%, #150a10 65%)",
    caption: "blooming, even from afar",
  },
];

// Normalized (0–1) SVG path data. Every command is coordinate-only
// (M/L/C/Q — no arcs), so a single string can be uniformly rescaled
// to any pixel size just by multiplying every number in it, and reused
// as-is inside a canvas Path2D. One shape definition, three render targets
// (swatch icon, live CSS clip-path, and the captured PNG) always match.
const SHAPE_PATHS: Record<string, string> = {
  circle:
    "M1,0.5 C1,0.77615 0.77615,1 0.5,1 C0.22385,1 0,0.77615 0,0.5 C0,0.22385 0.22385,0 0.5,0 C0.77615,0 1,0.22385 1,0.5 Z",
  heart:
    "M0.5,0.94 C0.5,0.94 0.05,0.58 0.05,0.30 C0.05,0.12 0.19,0 0.35,0 C0.45,0 0.5,0.08 0.5,0.20 C0.5,0.08 0.55,0 0.65,0 C0.81,0 0.95,0.12 0.95,0.30 C0.95,0.58 0.5,0.94 0.5,0.94 Z",
  arch:
    "M0.08,0.45 C0.08,0.218 0.268,0.03 0.5,0.03 C0.732,0.03 0.92,0.218 0.92,0.45 L0.92,0.90 Q0.92,0.97 0.85,0.97 L0.15,0.97 Q0.08,0.97 0.08,0.90 Z",
  polaroid:
    "M0.06,0 Q0,0 0,0.06 L0,0.94 Q0,1 0.06,1 L0.94,1 Q1,1 1,0.94 L1,0.06 Q1,0 0.94,0 Z",
};

type ShapeStyle = { id: string; label: string; hint: string; d: string };

const SHAPES: ShapeStyle[] = [
  { id: "circle", label: "Porthole", hint: "the classic", d: SHAPE_PATHS.circle },
  { id: "heart", label: "Locket", hint: "extra soft", d: SHAPE_PATHS.heart },
  { id: "arch", label: "Archway", hint: "a little grand", d: SHAPE_PATHS.arch },
  { id: "polaroid", label: "Instant", hint: "snapshot feel", d: SHAPE_PATHS.polaroid },
];

type BackdropStyle = { id: string; label: string };

const BACKDROPS: BackdropStyle[] = [
  { id: "stardust", label: "Stardust" },
  { id: "petals", label: "Petals" },
  { id: "confetti", label: "Confetti" },
  { id: "clear", label: "Clear" },
];

const CONFETTI_COLORS = ["#ff8fab", "#e8b65a", "#b9a7ff", "#7ed9a3", "#ff7a59"];

function scalePathD(d: string, size: number) {
  return d.replace(/-?\d*\.?\d+/g, (m) => (parseFloat(m) * size).toFixed(2));
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "8b3d6a843587e3675883640d",
      credential: "6BdZIExJu1RAizoq",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "8b3d6a843587e3675883640d",
      credential: "6BdZIExJu1RAizoq",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "8b3d6a843587e3675883640d",
      credential: "6BdZIExJu1RAizoq",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "8b3d6a843587e3675883640d",
      credential: "6BdZIExJu1RAizoq",
    },
  ],
};

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:4000";

function randomCode() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function Page() {
  const [stage, setStage] = useState<Stage>("setup");
  const [myCode, setMyCode] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const [palette, setPalette] = useState<PaletteStyle>(PALETTES[0]);
  const [shape, setShape] = useState<ShapeStyle>(SHAPES[0]);
  const [backdrop, setBackdrop] = useState<BackdropStyle>(BACKDROPS[0]);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const roleRef = useRef<"host" | "guest" | null>(null);
  const roomRef = useRef<string>("");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const backdropRef = useRef(backdrop);
  backdropRef.current = backdrop;

  const captureTargetRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const log = useCallback((msg: string, level: LogLevel = "info") => {
    const time =
      new Date().toLocaleTimeString(undefined, { hour12: false }) +
      "." +
      String(new Date().getMilliseconds()).padStart(3, "0");
    if (level === "error") console.error("[SameSky]", msg);
    else console.log("[SameSky]", msg);
    setLogs((prev) => [...prev.slice(-59), { time, msg, level }]);
  }, []);

  const cleanupCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    captureTargetRef.current = null;
  };

  /* ---------------------------- photo compose ---------------------------- */

  const drawBackdropSprinkle = (
    ctx: CanvasRenderingContext2D,
    id: string,
    W: number,
    H: number,
    ringColor: string
  ) => {
    if (id === "clear") return;
    const usableH = H - 150;
    if (id === "stardust") {
      ctx.fillStyle = "rgba(245,239,230,0.5)";
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === "petals") {
      const heart = new Path2D(SHAPE_PATHS.heart);
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        const s = 8 + Math.random() * 10;
        ctx.save();
        ctx.globalAlpha = 0.22 + Math.random() * 0.25;
        ctx.fillStyle = ringColor;
        ctx.translate(x, y);
        ctx.rotate((Math.random() - 0.5) * 0.6);
        ctx.scale(s, s);
        ctx.translate(-0.5, -0.5);
        ctx.fill(heart);
        ctx.restore();
      }
    } else if (id === "confetti") {
      for (let i = 0; i < 55; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        ctx.save();
        ctx.globalAlpha = 0.55 + Math.random() * 0.3;
        ctx.fillStyle = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        ctx.translate(x, y);
        ctx.rotate(Math.random() * Math.PI);
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.restore();
      }
    }
  };

  // Clips `video` into the shape `d` (unit path) centered at (cx, cy) with
  // bounding box `size`, mirrored like a selfie camera.
  const drawShapeVideo = (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    d: string,
    cx: number,
    cy: number,
    size: number
  ) => {
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size, size);
    ctx.clip(new Path2D(d));
    // undo the transform while keeping the clip mask, so the video draws
    // at native pixel coordinates
    ctx.scale(1 / size, 1 / size);
    ctx.translate(-(cx - size / 2), -(cy - size / 2));

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = Math.max(size / vw, size / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.translate(cx, cy);
    ctx.scale(-1, 1);
    ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  };

  const drawShapeRim = (
    ctx: CanvasRenderingContext2D,
    d: string,
    cx: number,
    cy: number,
    size: number,
    ring: string
  ) => {
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size, size);
    ctx.lineWidth = 6 / size;
    ctx.strokeStyle = ring;
    ctx.stroke(new Path2D(d));
    ctx.restore();
  };

  const drawPhoto = useCallback(() => {
    const canvas = canvasRef.current;
    const localVideo = localVideoRef.current;
    const remoteVideo = remoteVideoRef.current;
    if (!canvas || !localVideo || !remoteVideo) return;
    const p = paletteRef.current;
    const s = shapeRef.current;
    const b = backdropRef.current;

    const W = 960;
    const H = 680;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = p.id === "coral" || p.id === "bloom" ? "#2a1a1e" : "#0d0e18";
    ctx.fillRect(0, 0, W, H);

    drawBackdropSprinkle(ctx, b.id, W, H, p.ring);

    const size = 300;
    const cy = 250;
    const leftCx = W / 2 - 95;
    const rightCx = W / 2 + 95;

    drawShapeVideo(ctx, remoteVideo, s.d, rightCx, cy, size);
    drawShapeVideo(ctx, localVideo, s.d, leftCx, cy, size);
    drawShapeRim(ctx, s.d, leftCx, cy, size, p.ring);
    drawShapeRim(ctx, s.d, rightCx, cy, size, p.ring);

    const stripH = 150;
    ctx.fillStyle = p.paper;
    ctx.fillRect(0, H - stripH, W, stripH);

    ctx.fillStyle = p.ink;
    ctx.font = "600 26px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(p.caption, W / 2, H - stripH + 55);

    const date = new Date();
    const dateStr = date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    ctx.font = "400 15px monospace";
    ctx.globalAlpha = 0.7;
    ctx.fillText(`same sky · ${dateStr}`, W / 2, H - stripH + 90);
    ctx.globalAlpha = 1;

    setPhoto(canvas.toDataURL("image/png"));
    setStage("result");
    setCountdown(null);
    log("Photo captured and composed.", "success");
  }, [log]);

  const beginSyncedCountdown = useCallback(
    (targetTime: number) => {
      cleanupCountdown();
      captureTargetRef.current = targetTime;
      countdownTimerRef.current = setInterval(() => {
        const remaining = (captureTargetRef.current ?? 0) - Date.now();
        const secs = Math.ceil(remaining / 1000);
        if (remaining <= 0) {
          cleanupCountdown();
          setCountdown(0);
          setTimeout(() => drawPhoto(), 80);
        } else {
          setCountdown(secs);
        }
      }, 100);
    },
    [drawPhoto]
  );

  const sendAppMessage = (msg: any) => {
    const ch = dataChannelRef.current;
    if (ch && ch.readyState === "open") {
      ch.send(JSON.stringify(msg));
    } else {
      log(`Tried to send "${msg.type}" but data channel isn't open yet.`, "error");
    }
  };

  const sendStyle = useCallback(() => {
    sendAppMessage({
      type: "style",
      paletteId: paletteRef.current.id,
      shapeId: shapeRef.current.id,
      backdropId: backdropRef.current.id,
    });
  }, []);

  const wireDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.onopen = () => {
        setConnected(true);
        log("Data channel open — style picks and countdown will sync now.", "success");
      };
      channel.onclose = () => {
        setConnected(false);
        log("Data channel closed.", "error");
      };
      channel.onerror = (e) => log(`Data channel error: ${JSON.stringify(e)}`, "error");
      channel.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data?.type === "style") {
            const p = PALETTES.find((x) => x.id === data.paletteId);
            const s = SHAPES.find((x) => x.id === data.shapeId);
            const b = BACKDROPS.find((x) => x.id === data.backdropId);
            if (p) setPalette(p);
            if (s) setShape(s);
            if (b) setBackdrop(b);
          } else if (data?.type === "countdown") {
            log("Partner started the countdown.", "info");
            beginSyncedCountdown(data.targetTime);
          } else if (data?.type === "restart") {
            setPhoto(null);
            setStage("live");
          }
        } catch {
          log("Received a message that wasn't valid JSON.", "error");
        }
      };
    },
    [beginSyncedCountdown, log]
  );

  const createPeerConnection = useCallback(
    (isInitiator: boolean) => {
      log(`Creating WebRTC connection (initiator=${isInitiator})…`);
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const type =
            e.candidate.type ||
            (e.candidate.candidate.includes("typ relay")
              ? "relay"
              : e.candidate.candidate.includes("typ srflx")
              ? "srflx"
              : "host");
          log(
            `Gathered ICE candidate (${type}): ${e.candidate.protocol} ${e.candidate.address}:${e.candidate.port}`
          );
          socketRef.current?.emit("signal", {
            type: "candidate",
            candidate: e.candidate.toJSON(),
          });
        } else {
          log("Finished gathering ICE candidates.", "success");
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        log(
          `ICE connection state: ${state}`,
          state === "failed"
            ? "error"
            : state === "connected" || state === "completed"
            ? "success"
            : "info"
        );
        if (state === "failed") {
          setError(
            "Couldn't establish a direct connection — this can happen on some networks. Try again or switch networks."
          );
          pc.getStats().then((stats) => {
            let activeCandidatePair = false;
            stats.forEach((report) => {
              if (report.type === "candidate-pair" && report.state === "succeeded") {
                activeCandidatePair = true;
              }
            });
            if (!activeCandidatePair) {
              log("No valid ICE candidate pair was found. TURN server likely blocked or unreachable.", "error");
            }
          });
        }
      };

      pc.onconnectionstatechange = () => {
        log(`Peer connection state: ${pc.connectionState}`);
      };

      pc.ontrack = (e) => {
        log("Remote video track received.", "success");
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
          remoteVideoRef.current.play().catch((err) =>
            log(`Remote video play() failed: ${err.message}`, "error")
          );
        }
        setStage((s) => (s === "result" ? s : "live"));
        // give the partner our current look once we're actually connected
        setTimeout(() => sendStyle(), 300);
      };

      if (isInitiator) {
        const channel = pc.createDataChannel("data");
        wireDataChannel(channel);
      } else {
        pc.ondatachannel = (e) => wireDataChannel(e.channel);
      }

      return pc;
    },
    [log, wireDataChannel, sendStyle]
  );

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    while (pendingCandidatesRef.current.length) {
      const c = pendingCandidatesRef.current.shift()!;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err: any) {
        log(`Failed to add queued ICE candidate: ${err.message}`, "error");
      }
    }
  }, [log]);

  const handleSignal = useCallback(
    async (data: any) => {
      if (data.type === "offer") {
        log("Received offer from partner.");
        if (!pcRef.current) createPeerConnection(false);
        const pc = pcRef.current!;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushPendingCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit("signal", { type: "answer", sdp: answer });
        log("Sent answer back to partner.");
      } else if (data.type === "answer") {
        log("Received answer from partner.");
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushPendingCandidates();
      } else if (data.type === "candidate") {
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (err: any) {
            log(`Failed to add ICE candidate: ${err.message}`, "error");
          }
        } else {
          pendingCandidatesRef.current.push(data.candidate);
        }
      }
    },
    [createPeerConnection, flushPendingCandidates, log]
  );

  const connectSocket = useCallback(
    async (room: string, role: "host" | "guest") => {
      roomRef.current = room;
      roleRef.current = role;

      log(`Pinging ${SIGNALING_URL} to wake it up (free-tier servers can sleep)…`);
      const wakeStart = performance.now();
      try {
        await fetch(`${SIGNALING_URL}/health`, { mode: "cors" });
        log(`Server responded in ${(performance.now() - wakeStart).toFixed(0)}ms.`, "success");
      } catch (err: any) {
        log(`Wake-up ping failed (${err.message}). It may still be starting up — continuing anyway.`, "error");
      }

      log(`Connecting to signaling server at ${SIGNALING_URL}…`);
      const t0 = performance.now();
      const { io } = await import("socket.io-client");
      const socket = io(SIGNALING_URL, {
        transports: ["websocket", "polling"],
        timeout: 45000,
        reconnectionAttempts: 5,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        log(`Socket connected in ${(performance.now() - t0).toFixed(0)}ms.`, "success");
        socket.emit("join", room);
      });

      socket.on("connect_error", (err) => {
        log(`Socket connection error: ${err.message}`, "error");
        setError("Couldn't reach the signaling server. Check the server URL and that it's running.");
      });

      socket.on("role", async (assignedRole: "host" | "guest") => {
        log(`Server confirmed role: ${assignedRole}.`, "success");
        if (assignedRole === "guest") {
          const pc = createPeerConnection(true);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("signal", { type: "offer", sdp: offer });
          log("Sent offer to partner.");
        }
      });

      socket.on("peer-joined", () => {
        log("Partner joined the room.", "success");
      });

      socket.on("peer-left", () => {
        log("Partner disconnected.", "error");
        setError("Your partner disconnected.");
        setConnected(false);
      });

      socket.on("room-full", () => {
        log("Room is already full.", "error");
        setError("That session already has two people in it.");
        setStage("setup");
      });

      socket.on("signal", (data: any) => {
        handleSignal(data).catch((err) => log(`Signal handling error: ${err.message}`, "error"));
      });
    },
    [createPeerConnection, handleSignal, log]
  );

  const getCamera = async () => {
    log("Requesting camera access…");
    const t0 = performance.now();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    log(`Camera ready in ${(performance.now() - t0).toFixed(0)}ms.`, "success");
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      await localVideoRef.current.play().catch(() => {});
    }
    return stream;
  };

  const startHost = async () => {
    setError(null);
    try {
      await getCamera();
    } catch (err: any) {
      log(`Camera access failed: ${err.message}`, "error");
      setError("Camera access is needed to start a session.");
      return;
    }
    const code = randomCode();
    setMyCode(code);
    setStage("waiting");
    connectSocket(code, "host");
  };

  const joinSession = async () => {
    setError(null);
    const target = joinInput.trim().toLowerCase();
    if (!target) {
      setError("Enter your partner's code first.");
      return;
    }
    try {
      await getCamera();
    } catch (err: any) {
      log(`Camera access failed: ${err.message}`, "error");
      setError("Camera access is needed to join.");
      return;
    }
    setStage("joining");
    connectSocket(target, "guest");
  };

  const pickPalette = (p: PaletteStyle) => {
    setPalette(p);
    setTimeout(sendStyle, 0);
  };
  const pickShape = (s: ShapeStyle) => {
    setShape(s);
    setTimeout(sendStyle, 0);
  };
  const pickBackdrop = (b: BackdropStyle) => {
    setBackdrop(b);
    setTimeout(sendStyle, 0);
  };

  const triggerCapture = () => {
    const targetTime = Date.now() + 3200;
    sendAppMessage({ type: "countdown", targetTime });
    beginSyncedCountdown(targetTime);
  };

  const retake = () => {
    setPhoto(null);
    setStage("live");
    sendAppMessage({ type: "restart" });
  };

  const downloadPhoto = () => {
    if (!photo) return;
    const a = document.createElement("a");
    a.href = photo;
    a.download = "same-sky.png";
    a.click();
  };

  useEffect(() => {
    return () => {
      cleanupCountdown();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      socketRef.current?.disconnect();
    };
  }, []);

  const pageGlow = palette.glow;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px 200px",
        background: pageGlow,
        transition: "background 0.6s ease",
      }}
    >
      <GlobalBits />

      {stage === "setup" && (
        <SetupScreen
          joinInput={joinInput}
          setJoinInput={setJoinInput}
          onHost={startHost}
          onJoin={joinSession}
          error={error}
        />
      )}

      {(stage === "waiting" || stage === "joining") && (
        <div className="card" style={{ padding: 48, textAlign: "center", maxWidth: 440 }}>
          <p className="eyebrow" style={{ marginBottom: 14 }}>
            {stage === "waiting" ? "Waiting for your partner" : "Connecting…"}
          </p>
          {stage === "waiting" && (
            <>
              <p style={{ opacity: 0.75, marginBottom: 20, fontSize: 15 }}>
                Send them this code. As soon as they enter it, you'll both appear on screen.
              </p>
              <div
                className="wordmark"
                style={{
                  fontSize: 40,
                  letterSpacing: "0.08em",
                  color: "var(--coral)",
                  marginBottom: 24,
                  textTransform: "uppercase",
                }}
              >
                {myCode}
              </div>
            </>
          )}
          <PulseDots color={palette.ring} />
          {error && <p style={{ color: "var(--coral)", marginTop: 18, fontSize: 14 }}>{error}</p>}
        </div>
      )}

      {(stage === "live" || stage === "result") && (
        <BoothScreen
          stage={stage}
          palette={palette}
          palettes={PALETTES}
          onPickPalette={pickPalette}
          shape={shape}
          shapes={SHAPES}
          onPickShape={pickShape}
          backdrop={backdrop}
          backdrops={BACKDROPS}
          onPickBackdrop={pickBackdrop}
          onCapture={triggerCapture}
          countdown={countdown}
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          connected={connected}
          photo={photo}
          onRetake={retake}
          onDownload={downloadPhoto}
        />
      )}

      <video ref={localVideoRef} muted playsInline style={{ display: "none" }} />
      <video ref={remoteVideoRef} muted playsInline style={{ display: "none" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <DebugPanel logs={logs} open={debugOpen} setOpen={setDebugOpen} />
    </main>
  );
}

/* --------------------------------- pieces -------------------------------- */

function GlobalBits() {
  return (
    <style>{`
      @keyframes pulseLine { 0%,100% { opacity:.3; transform: scale(0.85);} 50% { opacity:1; transform: scale(1);} }
      @keyframes floatUp { 0% { transform: translateY(0) rotate(0deg); opacity:0; } 15% { opacity:.9; } 100% { transform: translateY(-140px) rotate(18deg); opacity:0; } }
      @keyframes softPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,143,171,0.0); } 50% { box-shadow: 0 0 0 10px rgba(255,143,171,0.0); } }
      @keyframes gentleBeat { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
    `}</style>
  );
}

function SetupScreen({
  joinInput,
  setJoinInput,
  onHost,
  onJoin,
  error,
}: {
  joinInput: string;
  setJoinInput: (v: string) => void;
  onHost: () => void;
  onJoin: () => void;
  error: string | null;
}) {
  return (
    <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
      <p className="eyebrow" style={{ marginBottom: 10 }}>
        A photo booth for two, anywhere
      </p>
      <h1 className="wordmark" style={{ fontSize: 52, margin: "0 0 14px", lineHeight: 1.05 }}>
        Same Sky
      </h1>
      <p style={{ opacity: 0.75, fontSize: 16, lineHeight: 1.6, marginBottom: 40 }}>
        Two cameras, one countdown. Connect with your person, pick a window shape and a
        vibe together, and count down to a photo you both keep — no matter the distance.
      </p>

      <div className="card" style={{ padding: 32, marginBottom: 20 }}>
        <p style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Start a session</p>
        <button className="btn-primary" style={{ width: "100%" }} onClick={onHost}>
          Get a code
        </button>
      </div>

      <div className="card" style={{ padding: 32 }}>
        <p style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Have a code already?</p>
        <input
          className="code-input"
          placeholder="ENTER CODE"
          value={joinInput}
          onChange={(e) => setJoinInput(e.target.value)}
          style={{ marginBottom: 14 }}
        />
        <button className="btn-ghost" style={{ width: "100%" }} onClick={onJoin}>
          Connect
        </button>
      </div>

      {error && <p style={{ color: "var(--coral)", marginTop: 18, fontSize: 14 }}>{error}</p>}
    </div>
  );
}

function PulseDots({ color = "var(--gold)" }: { color?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            animation: `pulseLine 1.2s ${i * 0.2}s infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
}

function BoothScreen({
  stage,
  palette,
  palettes,
  onPickPalette,
  shape,
  shapes,
  onPickShape,
  backdrop,
  backdrops,
  onPickBackdrop,
  onCapture,
  countdown,
  localVideoRef,
  remoteVideoRef,
  connected,
  photo,
  onRetake,
  onDownload,
}: {
  stage: Stage;
  palette: PaletteStyle;
  palettes: PaletteStyle[];
  onPickPalette: (p: PaletteStyle) => void;
  shape: ShapeStyle;
  shapes: ShapeStyle[];
  onPickShape: (s: ShapeStyle) => void;
  backdrop: BackdropStyle;
  backdrops: BackdropStyle[];
  onPickBackdrop: (b: BackdropStyle) => void;
  onCapture: () => void;
  countdown: number | null;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  connected: boolean;
  photo: string | null;
  onRetake: () => void;
  onDownload: () => void;
}) {
  const showBooth = stage === "live";
  return (
    <div style={{ width: "100%", maxWidth: 720, textAlign: "center" }}>
      {showBooth && (
        <>
          <p className="eyebrow" style={{ marginBottom: 20 }}>
            {connected ? "Connected" : "Linking up…"}
          </p>

          <div
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "center",
              marginBottom: 28,
              height: 300,
            }}
          >
            <FloatingSprinkle backdrop={backdrop} ring={palette.ring} />
            <ShapeWindow videoRef={localVideoRef} offset={-90} size={230} d={shape.d} ring={palette.ring} mirrored />
            <ShapeWindow videoRef={remoteVideoRef} offset={90} size={230} d={shape.d} ring={palette.ring} />
            {countdown !== null && countdown > 0 && (
              <div style={{ ...countdownOverlayStyle, animation: "gentleBeat 1s ease-in-out infinite" }}>
                {countdown}
              </div>
            )}
          </div>

          <PickerRow
            label="Vibe"
            selectedId={palette.id}
            items={palettes.map((p) => ({ id: p.id, title: p.label, swatch: p.swatch }))}
            onPick={(id) => onPickPalette(palettes.find((p) => p.id === id)!)}
          />

          <PickerRow
            label="Window"
            selectedId={shape.id}
            items={shapes.map((s) => ({ id: s.id, title: s.label, sub: s.hint, d: s.d }))}
            ring={palette.ring}
            onPick={(id) => onPickShape(shapes.find((s) => s.id === id)!)}
          />

          <PickerRow
            label="Sparkle"
            selectedId={backdrop.id}
            items={backdrops.map((b) => ({ id: b.id, title: b.label }))}
            onPick={(id) => onPickBackdrop(backdrops.find((b) => b.id === id)!)}
          />

          <button
            className="btn-primary"
            onClick={onCapture}
            disabled={!connected || countdown !== null}
            style={{ marginTop: 8 }}
          >
            {countdown !== null ? "Get ready…" : "Capture together"}
          </button>
        </>
      )}

      {stage === "result" && photo && (
        <>
          <p className="eyebrow" style={{ marginBottom: 20 }}>
            Your photo
          </p>
          <img
            src={photo}
            alt="Captured moment"
            style={{
              width: "100%",
              maxWidth: 480,
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              marginBottom: 28,
            }}
          />
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn-ghost" onClick={onRetake}>
              Take another
            </button>
            <button className="btn-primary" onClick={onDownload}>
              Save photo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ picker rows ------------------------------ */

function PickerRow({
  label,
  items,
  selectedId,
  onPick,
  ring,
}: {
  label: string;
  items: { id: string; title: string; sub?: string; swatch?: string; d?: string }[];
  selectedId: string;
  onPick: (id: string) => void;
  ring?: string;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <p
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          opacity: 0.55,
          marginBottom: 10,
        }}
      >
        {label}
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {items.map((item) => {
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              onClick={() => onPick(item.id)}
              title={item.title}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                opacity: active ? 1 : 0.6,
                transition: "opacity 0.15s ease, transform 0.15s ease",
                transform: active ? "translateY(-2px)" : "none",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: item.swatch ? "50%" : 8,
                  border: active ? `2px solid var(--cream)` : "2px solid transparent",
                  boxShadow: active ? `0 0 0 2px ${ring || "rgba(0,0,0,0.15)"}` : "none",
                  background: item.swatch || "rgba(245,239,230,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {item.d && (
                  <svg viewBox="0 0 1 1" width={22} height={22}>
                    <path d={item.d} fill={active ? ring || "var(--cream)" : "rgba(245,239,230,0.7)"} />
                  </svg>
                )}
                {!item.d && !item.swatch && (
                  <BackdropGlyph id={item.id} color={active ? ring || "var(--cream)" : "rgba(245,239,230,0.7)"} />
                )}
              </span>
              <span style={{ fontSize: 10, opacity: 0.75 }}>{item.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BackdropGlyph({ id, color }: { id: string; color: string }) {
  if (id === "stardust") {
    return (
      <svg viewBox="0 0 24 24" width={16} height={16}>
        <circle cx="6" cy="8" r="1.4" fill={color} />
        <circle cx="14" cy="5" r="1" fill={color} />
        <circle cx="17" cy="14" r="1.6" fill={color} />
        <circle cx="9" cy="17" r="1" fill={color} />
      </svg>
    );
  }
  if (id === "petals") {
    return (
      <svg viewBox="0 0 1 1" width={16} height={16}>
        <path d={SHAPE_PATHS.heart} fill={color} />
      </svg>
    );
  }
  if (id === "confetti") {
    return (
      <svg viewBox="0 0 24 24" width={16} height={16}>
        <rect x="4" y="4" width="5" height="2.5" fill={color} transform="rotate(20 6 5)" />
        <rect x="14" y="8" width="5" height="2.5" fill={color} transform="rotate(-15 16 9)" />
        <rect x="8" y="15" width="5" height="2.5" fill={color} transform="rotate(40 10 16)" />
      </svg>
    );
  }
  // clear
  return (
    <svg viewBox="0 0 24 24" width={16} height={16}>
      <circle cx="12" cy="12" r="7" fill="none" stroke={color} strokeWidth="1.4" strokeDasharray="3 3" />
    </svg>
  );
}

function FloatingSprinkle({ backdrop, ring }: { backdrop: BackdropStyle; ring: string }) {
  const bits = useMemo(() => {
    if (backdrop.id === "clear") return [];
    const count = 7;
    return Array.from({ length: count }).map((_, i) => ({
      left: 8 + ((i * 37) % 90),
      delay: (i % 5) * 0.9,
      duration: 5 + (i % 4),
      size: 8 + (i % 3) * 4,
    }));
  }, [backdrop.id]);

  if (backdrop.id === "clear") return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {bits.map((b, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${b.left}%`,
            bottom: 0,
            width: b.size,
            height: b.size,
            animation: `floatUp ${b.duration}s ${b.delay}s ease-in infinite`,
          }}
        >
          {backdrop.id === "petals" && (
            <svg viewBox="0 0 1 1" width={b.size} height={b.size}>
              <path d={SHAPE_PATHS.heart} fill={ring} opacity={0.55} />
            </svg>
          )}
          {backdrop.id === "stardust" && (
            <span
              style={{
                display: "block",
                width: b.size * 0.35,
                height: b.size * 0.35,
                borderRadius: "50%",
                background: "rgba(245,239,230,0.8)",
              }}
            />
          )}
          {backdrop.id === "confetti" && (
            <span
              style={{
                display: "block",
                width: b.size * 0.9,
                height: b.size * 0.35,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                opacity: 0.75,
              }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------- windows -------------------------------- */

function ShapeWindow({
  videoRef,
  offset,
  size,
  d,
  ring,
  mirrored,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  offset: number;
  size: number;
  d: string;
  ring: string;
  mirrored?: boolean;
}) {
  const clip = useMemo(() => `path("${scalePathD(d, size)}")`, [d, size]);
  return (
    <div
      style={{
        position: "absolute",
        left: `calc(50% + ${offset}px)`,
        transform: "translateX(-50%)",
        width: size,
        height: size,
        clipPath: clip,
        WebkitClipPath: clip,
        background: "#000",
        boxShadow: `0 0 0 3px ${ring}, 0 12px 30px rgba(0,0,0,0.35)`,
      }}
    >
      <VisibleVideo videoRef={videoRef} mirrored={mirrored} />
    </div>
  );
}

function VisibleVideo({
  videoRef,
  mirrored,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  mirrored?: boolean;
}) {
  const visibleRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const src = videoRef.current;
    const vis = visibleRef.current;
    if (!src || !vis) return;
    const sync = () => {
      if (src.srcObject && vis.srcObject !== src.srcObject) {
        vis.srcObject = src.srcObject as MediaStream;
        vis.play().catch(() => {});
      }
    };
    sync();
    const id = setInterval(sync, 400);
    return () => clearInterval(id);
  }, [videoRef]);
  return (
    <video
      ref={visibleRef}
      autoPlay
      muted
      playsInline
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: mirrored ? "scaleX(-1)" : "none",
      }}
    />
  );
}

function DebugPanel({
  logs,
  open,
  setOpen,
}: {
  logs: LogEntry[];
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const levelColor: Record<LogLevel, string> = {
    info: "rgba(245,239,230,0.75)",
    success: "#7ed9a3",
    error: "#ff7a59",
  };
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: open ? "40vh" : 40,
        background: "rgba(10,10,16,0.92)",
        borderTop: "1px solid var(--line)",
        transition: "max-height 0.2s ease",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          height: 40,
          background: "transparent",
          border: "none",
          color: "var(--cream)",
          fontFamily: "monospace",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {open ? "▾" : "▸"} debug log ({logs.length})
      </button>
      {open && (
        <div
          style={{
            padding: "0 16px 16px",
            overflowY: "auto",
            maxHeight: "calc(40vh - 40px)",
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {logs.length === 0 && (
            <p style={{ opacity: 0.5 }}>Nothing logged yet — start a session or join one.</p>
          )}
          {logs.map((l, i) => (
            <div key={i} style={{ color: levelColor[l.level] }}>
              <span style={{ opacity: 0.5 }}>{l.time}</span> {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const countdownOverlayStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  fontFamily: "var(--font-display)",
  fontSize: 72,
  fontWeight: 700,
  color: "var(--cream)",
  textShadow: "0 0 30px rgba(0,0,0,0.8)",
  zIndex: 5,
};