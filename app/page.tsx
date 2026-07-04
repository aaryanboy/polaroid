"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { default as PeerType, DataConnection, MediaConnection } from "peerjs";

type Stage = "setup" | "waiting" | "joining" | "live" | "result";

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

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

function randomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
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
  const [role, setRole] = useState<"host" | "guest" | null>(null);

  const peerRef = useRef<PeerType | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const captureTargetRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // background
    ctx.fillStyle = f.id === "coral" ? "#2a1a12" : "#0d0e18";
    ctx.fillRect(0, 0, W, H);
    // subtle stars
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
      ctx.scale(-1, 1); // mirror like a mirror/selfie
      ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    };

    drawCircleVideo(remoteVideo, rightCx);
    drawCircleVideo(localVideo, leftCx);

    // rims
    const drawRim = (cx: number) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = f.ring;
      ctx.stroke();
    };
    drawRim(leftCx);
    drawRim(rightCx);

    // center highlight where circles overlap
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

    // bottom paper strip
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
  }, []);

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

  const wireDataConnection = useCallback(
    (conn: DataConnection) => {
      dataConnRef.current = conn;
      conn.on("open", () => setConnected(true));
      conn.on("data", (data: any) => {
        if (data?.type === "frame") {
          const f = FRAMES.find((fr) => fr.id === data.id);
          if (f) setFrame(f);
        } else if (data?.type === "countdown") {
          beginSyncedCountdown(data.targetTime);
        } else if (data?.type === "restart") {
          setPhoto(null);
          setStage("live");
        }
      });
      conn.on("close", () => setConnected(false));
    },
    [beginSyncedCountdown]
  );

  const getCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
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
    } catch {
      setError("Camera access is needed to start a session.");
      return;
    }
    const { default: Peer } = await import("peerjs");
    const code = `sky-${randomCode().toLowerCase()}`;
    setMyCode(code);
    setRole("host");
    setStage("waiting");

    const peer = new Peer(code, { config: ICE_CONFIG });
    peerRef.current = peer;

    peer.on("error", (err) => {
      setError("Connection error: " + err.type);
    });

    peer.on("connection", (conn) => {
      wireDataConnection(conn);
    });

    peer.on("call", (call) => {
      callRef.current = call;
      call.answer(localStreamRef.current ?? undefined);
      call.on("stream", (remoteStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        }
        setStage("live");
      });
    });
  };

  const joinSession = async () => {
    setError(null);
    const raw = joinInput.trim().toLowerCase().replace(/^sky-/, "");
    if (!raw) {
      setError("Enter your partner's code first.");
      return;
    }
    const target = `sky-${raw}`;
    try {
      await getCamera();
    } catch {
      setError("Camera access is needed to join.");
      return;
    }
    const { default: Peer } = await import("peerjs");
    setRole("guest");
    setStage("joining");

    const peer = new Peer({ config: ICE_CONFIG });
    peerRef.current = peer;

    peer.on("error", (err: any) => {
      if (err?.type === "peer-unavailable") {
        setError("No session found with that code — double check it and try again.");
      } else {
        setError(`Couldn't connect (${err?.type ?? "unknown error"}). Try again.`);
      }
      setStage("setup");
    });

    peer.on("open", () => {
      const conn = peer.connect(target);
      wireDataConnection(conn);

      const call = peer.call(target, localStreamRef.current!);
      callRef.current = call;
      call.on("stream", (remoteStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        }
        setStage("live");
      });
    });
  };

  const pickFrame = (f: FrameStyle) => {
    setFrame(f);
    dataConnRef.current?.send({ type: "frame", id: f.id });
  };

  const triggerCapture = () => {
    const targetTime = Date.now() + 3200;
    dataConnRef.current?.send({ type: "countdown", targetTime });
    beginSyncedCountdown(targetTime);
  };

  const retake = () => {
    setPhoto(null);
    setStage("live");
    dataConnRef.current?.send({ type: "restart" });
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
      peerRef.current?.destroy();
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
        padding: "32px 20px",
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
                {myCode.replace("sky-", "")}
              </div>
            </>
          )}
          <PulseDots />
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
      <h1
        className="wordmark"
        style={{ fontSize: 52, margin: "0 0 14px", lineHeight: 1.05 }}
      >
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
        <p style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>
          Have a code already?
        </p>
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

      {error && (
        <p style={{ color: "var(--coral)", marginTop: 18, fontSize: 14 }}>{error}</p>
      )}
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
                  border:
                    f.id === frame.id
                      ? "2px solid var(--cream)"
                      : "2px solid transparent",
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
  // Renders a second, visible video element mirroring the hidden source video's stream.
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
