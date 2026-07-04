"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";

type Stage = "setup" | "waiting" | "joining" | "live" | "result";
type LogLevel = "info" | "success" | "error";
type LogEntry = { time: string; msg: string; level: LogLevel };

type FrameStyle = {
  id: string;
  label: string;
  swatch: string;
  ring: string;
  paper: string;
  ink: string;
  caption: string;
};

const FRAMES: FrameStyle[] = [
  {
    id: "eclipse",
    label: "Eclipse",
    swatch: "linear-gradient(135deg,#e8b65a,#ff7a59)",
    ring: "#e8b65a",
    paper: "#f5efe6",
    ink: "#1a1210",
    caption: "same sky, two windows",
  },
  {
    id: "midnight",
    label: "Midnight",
    swatch: "linear-gradient(135deg,#2c2a4a,#5b4b8a)",
    ring: "#b9a7ff",
    paper: "#181732",
    ink: "#f5efe6",
    caption: "miles apart, same moment",
  },
  {
    id: "coral",
    label: "Coral",
    swatch: "linear-gradient(135deg,#ff7a59,#ffb199)",
    ring: "#ff7a59",
    paper: "#fff4ee",
    ink: "#3a2115",
    caption: "wish you were here",
  },
  {
    id: "film",
    label: "Film",
    swatch: "linear-gradient(135deg,#3a2b4a,#12131f)",
    ring: "#f5efe6",
    paper: "#12131f",
    ink: "#f5efe6",
    caption: "shot from two cities",
  },
];

const DEFAULT_ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
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
  const [frame, setFrame] = useState<FrameStyle>(FRAMES[0]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(true);

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
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const captureTargetRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceConfigRef = useRef<RTCConfiguration>(DEFAULT_ICE_CONFIG);

  useEffect(() => {
    fetch("/api/turn")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          iceConfigRef.current = {
            iceServers: [...DEFAULT_ICE_CONFIG.iceServers!, ...data],
          };
          console.log("Dynamic TURN servers loaded");
        }
      })
      .catch(console.error);
  }, []);

  const log = useCallback((msg: string, level: LogLevel = "info") => {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false }) +
      "." + String(new Date().getMilliseconds()).padStart(3, "0");
    if (level === "error") console.error("[SameSky]", msg);
    else console.log("[SameSky]", msg);
    setLogs((prev) => [...prev.slice(-59), { time, msg, level }]);
  }, []);

  const cleanupCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    captureTargetRef.current = null;
  };

  const drawPhoto = useCallback(() => {
    const canvas = canvasRef.current;
    const localVideo = localVideoRef.current;
    const remoteVideo = remoteVideoRef.current;
    if (!canvas || !localVideo || !remoteVideo) return;
    const f = frameRef.current;

    const W = 960;
    const H = 680;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = f.id === "coral" ? "#2a1a12" : "#0d0e18";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(245,239,230,0.5)";
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * W;
      const y = Math.random() * (H - 150);
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    const radius = 195;
    const cy = 250;
    const leftCx = W / 2 - 110;
    const rightCx = W / 2 + 110;

    const drawCircleVideo = (video: HTMLVideoElement, cx: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const scale = Math.max((radius * 2) / vw, (radius * 2) / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      ctx.translate(cx, cy);
      ctx.scale(-1, 1);
      ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    };

    drawCircleVideo(remoteVideo, rightCx);
    drawCircleVideo(localVideo, leftCx);

    const drawRim = (cx: number) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = f.ring;
      ctx.stroke();
    };
    drawRim(leftCx);
    drawRim(rightCx);

    ctx.save();
    ctx.beginPath();
    ctx.arc(leftCx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(rightCx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(245,239,230,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const stripH = 150;
    ctx.fillStyle = f.paper;
    ctx.fillRect(0, H - stripH, W, stripH);

    ctx.fillStyle = f.ink;
    ctx.font = "600 26px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(f.caption, W / 2, H - stripH + 55);

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

  const wireDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.onopen = () => {
        setConnected(true);
        log("Data channel open — frame picks and countdown will sync now.", "success");
      };
      channel.onclose = () => {
        setConnected(false);
        log("Data channel closed.", "error");
      };
      channel.onerror = (e) => log(`Data channel error: ${JSON.stringify(e)}`, "error");
      channel.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data?.type === "frame") {
            const f = FRAMES.find((fr) => fr.id === data.id);
            if (f) setFrame(f);
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
      const pc = new RTCPeerConnection(iceConfigRef.current);
      pcRef.current = pc;

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current?.emit("signal", {
            type: "candidate",
            candidate: e.candidate.toJSON(),
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        log(`ICE connection state: ${pc.iceConnectionState}`,
          pc.iceConnectionState === "failed" ? "error" :
          pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed" ? "success" : "info"
        );
        if (pc.iceConnectionState === "failed") {
          setError(
            "Couldn't establish a direct connection — this can happen on some networks. Try again or switch networks."
          );
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
      };

      if (isInitiator) {
        const channel = pc.createDataChannel("data");
        wireDataChannel(channel);
      } else {
        pc.ondatachannel = (e) => wireDataChannel(e.channel);
      }

      return pc;
    },
    [log, wireDataChannel]
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
        log(
          `Wake-up ping failed (${err.message}). It may still be starting up — continuing anyway.`,
          "error"
        );
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
        setError(
          "Couldn't reach the signaling server. Check the server URL and that it's running."
        );
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

  const pickFrame = (f: FrameStyle) => {
    setFrame(f);
    sendAppMessage({ type: "frame", id: f.id });
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

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px 200px",
      }}
    >
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
          <PulseDots />
          {error && <p style={{ color: "var(--coral)", marginTop: 18, fontSize: 14 }}>{error}</p>}
        </div>
      )}

      {(stage === "live" || stage === "result") && (
        <BoothScreen
          stage={stage}
          frame={frame}
          frames={FRAMES}
          onPickFrame={pickFrame}
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
        Two cameras, one countdown. Connect with your person, pick a frame together,
        and count down to a photo you both keep — no matter the distance.
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

function PulseDots() {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--gold)",
            animation: `pulseLine 1.2s ${i * 0.2}s infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
}

function BoothScreen({
  stage,
  frame,
  frames,
  onPickFrame,
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
  frame: FrameStyle;
  frames: FrameStyle[];
  onPickFrame: (f: FrameStyle) => void;
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
              height: 260,
            }}
          >
            <VideoCircle videoRef={localVideoRef} offset={-70} ring={frame.ring} mirrored />
            <VideoCircle videoRef={remoteVideoRef} offset={70} ring={frame.ring} />
            {countdown !== null && countdown > 0 && (
              <div style={countdownOverlayStyle}>{countdown}</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 32 }}>
            {frames.map((f) => (
              <button
                key={f.id}
                onClick={() => onPickFrame(f)}
                title={f.label}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: f.id === frame.id ? "2px solid var(--cream)" : "2px solid transparent",
                  background: f.swatch,
                  padding: 0,
                }}
              />
            ))}
          </div>

          <button
            className="btn-primary"
            onClick={onCapture}
            disabled={!connected || countdown !== null}
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

function VideoCircle({
  videoRef,
  offset,
  ring,
  mirrored,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  offset: number;
  ring: string;
  mirrored?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `calc(50% + ${offset}px)`,
        transform: "translateX(-50%)",
        width: 220,
        height: 220,
        borderRadius: "50%",
        overflow: "hidden",
        border: `3px solid ${ring}`,
        boxShadow: "0 0 0 6px rgba(0,0,0,0.25)",
        background: "#000",
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
