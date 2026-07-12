"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Socket } from "socket.io-client";

type Stage = "setup" | "waiting" | "joining" | "live" | "result";
type LogLevel = "info" | "success" | "error";
type LogEntry = { time: string; msg: string; level: LogLevel };

/* ----------------------------------------------------------------------- *
 * Style system: Syncable presets for filters, borders, and decorations.
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
  { id: "circle", label: "Porthole", hint: "classic circle", d: SHAPE_PATHS.circle },
  { id: "heart", label: "Locket", hint: "romantic heart", d: SHAPE_PATHS.heart },
  { id: "arch", label: "Archway", hint: "classic arch", d: SHAPE_PATHS.arch },
  { id: "polaroid", label: "Instant", hint: "square look", d: SHAPE_PATHS.polaroid },
];

type FilterStyle = {
  id: string;
  label: string;
  cssVal: string;
  swatch: string;
};

const FILTERS: FilterStyle[] = [
  { id: "normal", label: "Normal", cssVal: "none", swatch: "linear-gradient(135deg, #8e9eab, #eef2f3)" },
  { id: "golden_hour", label: "Golden Hour", cssVal: "brightness(1.1) saturate(1.25) sepia(0.15) contrast(0.95)", swatch: "linear-gradient(135deg, #fce0ad, #df9f28)" },
  { id: "sunset", label: "Warm Sunset", cssVal: "brightness(1.05) saturate(1.4) hue-rotate(-12deg) sepia(0.1)", swatch: "linear-gradient(135deg, #f87171, #fb923c)" },
  { id: "noir", label: "Noir (B&W)", cssVal: "grayscale(1) contrast(1.25) brightness(0.95)", swatch: "linear-gradient(135deg, #444, #111)" },
  { id: "retro", label: "Retro Film", cssVal: "sepia(0.35) contrast(0.9) brightness(1.05) saturate(0.9)", swatch: "linear-gradient(135deg, #c4b5fd, #818cf8)" },
  { id: "disposable", label: "Disposable", cssVal: "contrast(1.1) brightness(1.02) saturate(1.1) hue-rotate(5deg)", swatch: "linear-gradient(135deg, #34d399, #059669)" },
  { id: "matte", label: "Matte Fade", cssVal: "contrast(0.85) brightness(1.05) saturate(0.8)", swatch: "linear-gradient(135deg, #a1a1aa, #52525b)" },
  { id: "dream", label: "Dream", cssVal: "brightness(1.1) saturate(1.1) blur(0.3px) contrast(0.95)", swatch: "linear-gradient(135deg, #f472b6, #db2777)" },
  { id: "tokyo", label: "Tokyo Night", cssVal: "hue-rotate(220deg) saturate(1.3) contrast(1.1)", swatch: "linear-gradient(135deg, #3b82f6, #1e3a8a)" },
  { id: "cyberpunk", label: "Cyberpunk", cssVal: "hue-rotate(130deg) saturate(1.7) contrast(1.2)", swatch: "linear-gradient(135deg, #ec4899, #06b6d4)" },
  { id: "vhs", label: "VHS", cssVal: "contrast(1.1) brightness(1.04) saturate(1.2) sepia(0.05)", swatch: "linear-gradient(135deg, #f59e0b, #6b21a8)" },
  { id: "cinema", label: "Cinema", cssVal: "contrast(1.15) saturate(0.85) brightness(0.95)", swatch: "linear-gradient(135deg, #0f172a, #334155)" },
  { id: "soft_portrait", label: "Soft Glow", cssVal: "brightness(1.08) saturate(1.04) contrast(0.92)", swatch: "linear-gradient(135deg, #fed7aa, #f472b6)" },
  { id: "vintage", label: "Vintage", cssVal: "sepia(0.55) contrast(0.95) saturate(0.8) brightness(0.96)", swatch: "linear-gradient(135deg, #b45309, #78350f)" },
  { id: "cool_blue", label: "Cool Blue", cssVal: "hue-rotate(180deg) saturate(0.9) brightness(1.05)", swatch: "linear-gradient(135deg, #93c5fd, #2563eb)" },
  { id: "high_contrast", label: "High Pop", cssVal: "contrast(1.3) saturate(1.2)", swatch: "linear-gradient(135deg, #ef4444, #b91c1c)" },
  { id: "low_sat", label: "Low Sat", cssVal: "saturate(0.35) contrast(1.05)", swatch: "linear-gradient(135deg, #d1d5db, #6b7280)" },
  { id: "moody", label: "Moody", cssVal: "brightness(0.85) contrast(1.12) saturate(0.72)", swatch: "linear-gradient(135deg, #18181b, #27272a)" },
  { id: "bright_pop", label: "Bright Pop", cssVal: "brightness(1.1) saturate(1.3) contrast(1.02)", swatch: "linear-gradient(135deg, #a855f7, #fb7185)" },
  { id: "bw_classic", label: "Classic B&W", cssVal: "grayscale(1) contrast(1.05) brightness(1.0)", swatch: "linear-gradient(135deg, #888, #333)" }
];

type BorderStyle = {
  id: string;
  label: string;
  renderType: "classic-white" | "double" | "gold" | "rosegold" | "black" | "matte" | "filmstrip" | "kodak" | "instax" | "ivory" | "cream" | "cyberpunk" | "neon" | "gradient" | "sakura" | "silver" | "platinum" | "retro" | "memphis" | "polaroid-plus";
};

const BORDERS: BorderStyle[] = [
  { id: "classic_white", label: "Classic White", renderType: "classic-white" },
  { id: "double_border", label: "Double Frame", renderType: "double" },
  { id: "luxury_gold", label: "Luxury Gold", renderType: "gold" },
  { id: "rose_gold", label: "Rose Gold", renderType: "rosegold" },
  { id: "minimal_black", label: "Minimal Black", renderType: "black" },
  { id: "modern_matte", label: "Modern Matte", renderType: "matte" },
  { id: "film_strip", label: "Film Strip", renderType: "filmstrip" },
  { id: "kodak_style", label: "Kodak Style", renderType: "kodak" },
  { id: "instax_style", label: "Instax Cozy", renderType: "instax" },
  { id: "wedding_ivory", label: "Wedding Ivory", renderType: "ivory" },
  { id: "vintage_cream", label: "Vintage Cream", renderType: "cream" },
  { id: "cyberpunk", label: "Cyberpunk", renderType: "cyberpunk" },
  { id: "neon_glow", label: "Neon Glow", renderType: "neon" },
  { id: "rainbow_gradient", label: "Rainbow", renderType: "gradient" },
  { id: "sakura", label: "Sakura", renderType: "sakura" },
  { id: "elegant_silver", label: "Elegant Silver", renderType: "silver" },
  { id: "luxury_platinum", label: "Platinum", renderType: "platinum" },
  { id: "retro_90s", label: "Retro 90s", renderType: "retro" },
  { id: "memphis_design", label: "Memphis Style", renderType: "memphis" },
  { id: "polaroid_plus", label: "Polaroid Plus", renderType: "polaroid-plus" }
];

type BackdropStyle = { id: string; label: string };

const BACKDROPS: BackdropStyle[] = [
  { id: "stardust", label: "✨ Sparkles" },
  { id: "petals", label: "❤️ Hearts" },
  { id: "flowers", label: "🌸 Flowers" },
  { id: "stars", label: "⭐ Stars" },
  { id: "confetti", label: "🎉 Confetti" },
  { id: "butterflies", label: "🦋 Butterflies" },
  { id: "snow", label: "❄️ Snow" },
  { id: "balloons", label: "🎈 Balloons" },
  { id: "clear", label: "None" },
];

type ThemePreset = {
  id: string;
  label: string;
  paletteId: string;
  shapeId: string;
  backdropId: string;
  borderId: string;
  filterId: string;
};

const THEMES: ThemePreset[] = [
  { id: "minimal", label: "Minimalist", paletteId: "film", shapeId: "polaroid", backdropId: "clear", borderId: "minimal_black", filterId: "matte" },
  { id: "wedding", label: "Wedding Day", paletteId: "eclipse", shapeId: "arch", backdropId: "stardust", borderId: "wedding_ivory", filterId: "soft_portrait" },
  { id: "birthday", label: "Party Time", paletteId: "coral", shapeId: "circle", backdropId: "confetti", borderId: "retro_90s", filterId: "bright_pop" },
  { id: "cyberpunk", label: "Cyber Neon", paletteId: "midnight", shapeId: "polaroid", backdropId: "confetti", borderId: "cyberpunk", filterId: "cyberpunk" },
  { id: "luxury", label: "Royal Gold", paletteId: "eclipse", shapeId: "arch", backdropId: "stardust", borderId: "luxury_gold", filterId: "golden_hour" },
  { id: "vintage", label: "Old Film", paletteId: "eclipse", shapeId: "polaroid", backdropId: "clear", borderId: "vintage_cream", filterId: "vintage" },
  { id: "aesthetic", label: "Cherry Bloom", paletteId: "bloom", shapeId: "heart", backdropId: "flowers", borderId: "sakura", filterId: "dream" },
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

type PhotoLayout = "single" | "strip2" | "strip3" | "strip4" | "grid4";

export default function Page() {
  const [stage, setStage] = useState<Stage>("setup");
  const [myCode, setMyCode] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Styling Choices
  const [palette, setPalette] = useState<PaletteStyle>(PALETTES[0]);
  const [shape, setShape] = useState<ShapeStyle>(SHAPES[0]);
  const [backdrop, setBackdrop] = useState<BackdropStyle>(BACKDROPS[0]);
  const [selectedFilter, setSelectedFilter] = useState<FilterStyle>(FILTERS[0]);
  const [selectedBorder, setSelectedBorder] = useState<BorderStyle>(BORDERS[0]);
  const [selectedTheme, setSelectedTheme] = useState<string>("custom");

  // Multi-photo layouts
  const [layout, setLayout] = useState<PhotoLayout>("single");

  // Camera Settings
  const [mirror, setMirror] = useState<boolean>(true);
  const [grid, setGrid] = useState<boolean>(false);
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [flash, setFlash] = useState<boolean>(true);
  const [brightness, setBrightness] = useState<number>(1.0);
  const [exposure, setExposure] = useState<number>(1.0);

  // Decoration Options
  const [decDensity, setDecDensity] = useState<number>(40);
  const [decOpacity, setDecOpacity] = useState<number>(0.6);

  // Live capturing states
  const [countdown, setCountdown] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);

  // Multi-shot sequence
  const [fps, setFps] = useState<number>(0);
  const [shotQueue, setShotQueue] = useState<{ local: string; remote: string }[]>([]);
  const [currentShotNumber, setCurrentShotNumber] = useState<number>(-1);
  const [flashActive, setFlashActive] = useState<boolean>(false);

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
  const filterRef = useRef(selectedFilter);
  filterRef.current = selectedFilter;
  const borderRef = useRef(selectedBorder);
  borderRef.current = selectedBorder;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  const densityRef = useRef(decDensity);
  densityRef.current = decDensity;
  const opacityRef = useRef(decOpacity);
  opacityRef.current = decOpacity;

  const captureTargetRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // FPS Tracker
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const trackFps = () => {
      frameCount++;
      const time = performance.now();
      if (time >= lastTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (time - lastTime)));
        frameCount = 0;
        lastTime = time;
      }
      animId = requestAnimationFrame(trackFps);
    };

    trackFps();
    return () => cancelAnimationFrame(animId);
  }, []);

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

  /* ---------------------- Synth shutter noise (Web Audio) ---------------------- */
  const playShutter = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "triangle";
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
      console.warn("Shutter sound failed", e);
    }
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
    ctx.save();
    ctx.globalAlpha = opacityRef.current;
    ctx.fillStyle = ringColor;

    const density = densityRef.current;

    if (id === "stardust") {
      for (let i = 0; i < density; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 2 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === "petals") {
      const heart = new Path2D(SHAPE_PATHS.heart);
      for (let i = 0; i < density / 2; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        const s = 8 + Math.random() * 10;
        ctx.save();
        ctx.fillStyle = "#ff8fab";
        ctx.translate(x, y);
        ctx.rotate((Math.random() - 0.5) * 0.6);
        ctx.scale(s, s);
        ctx.translate(-0.5, -0.5);
        ctx.fill(heart);
        ctx.restore();
      }
    } else if (id === "flowers") {
      for (let i = 0; i < density / 2; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        const size = Math.random() * 12 + 6;
        drawFlower(ctx, x, y, size);
      }
    } else if (id === "stars") {
      for (let i = 0; i < density; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        const size = Math.random() * 8 + 4;
        drawStar(ctx, x, y, 5, size, size / 2, ringColor);
      }
    } else if (id === "confetti") {
      for (let i = 0; i < density; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        ctx.save();
        ctx.fillStyle = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        ctx.translate(x, y);
        ctx.rotate(Math.random() * Math.PI);
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.restore();
      }
    } else if (id === "butterflies") {
      for (let i = 0; i < density / 2; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        const size = Math.random() * 10 + 6;
        drawButterfly(ctx, x, y, size);
      }
    } else if (id === "snow") {
      ctx.fillStyle = "#FFF";
      for (let i = 0; i < density; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 3 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === "balloons") {
      for (let i = 0; i < density / 4; i++) {
        const x = Math.random() * W;
        const y = Math.random() * usableH;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        drawBalloon(ctx, x, y, 20, color);
      }
    }
    ctx.restore();
  };

  const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, color: string) => {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };

  const drawFlower = (ctx: CanvasRenderingContext2D, x: number, cy: number, size: number) => {
    ctx.save();
    ctx.translate(x, cy);
    ctx.fillStyle = "#FFB7C5";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(0, -size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate((Math.PI * 2) / 5);
    }
    ctx.beginPath();
    ctx.arc(0, 0, size / 3, 0, Math.PI * 2);
    ctx.fillStyle = "#FFF9E6";
    ctx.fill();
    ctx.restore();
  };

  const drawButterfly = (ctx: CanvasRenderingContext2D, x: number, cy: number, size: number) => {
    ctx.save();
    ctx.translate(x, cy);
    ctx.fillStyle = "#A78BFA";
    ctx.beginPath();
    ctx.ellipse(-size / 2, -size / 3, size / 2, size / 3, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-size / 2, size / 3, size / 2.5, size / 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size / 2, -size / 3, size / 2, size / 3, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 3, size / 2.5, size / 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3D2B56";
    ctx.fillRect(-1.5, -size, 3, size * 1.8);
    ctx.restore();
  };

  const drawBalloon = (ctx: CanvasRenderingContext2D, x: number, cy: number, size: number, color: string) => {
    ctx.save();
    ctx.translate(x, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.7, size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.quadraticCurveTo(5, size + 10, -5, size + 20);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  };

  // Capture helper for single camera feed
  const captureCamFrame = (video: HTMLVideoElement, isMirrored: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.save();
    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    return canvas.toDataURL("image/png");
  };

  // Clips `image` data URL into the shape `d` centered at (cx, cy)
  const drawShapeImage = (
    ctx: CanvasRenderingContext2D,
    imgSrc: string,
    d: string,
    cx: number,
    cy: number,
    size: number
  ) => {
    const img = new Image();
    img.src = imgSrc;
    if (!img.complete) return; // Make sure it loads

    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size, size);
    ctx.clip(new Path2D(d));
    ctx.scale(1 / size, 1 / size);
    ctx.translate(-(cx - size / 2), -(cy - size / 2));

    const iw = img.naturalWidth || 640;
    const ih = img.naturalHeight || 480;
    const scale = Math.max(size / iw, size / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  };

  // Upgraded custom border rendering in canvas
  const drawShapeRim = (
    ctx: CanvasRenderingContext2D,
    d: string,
    cx: number,
    cy: number,
    size: number,
    borderStyle: BorderStyle,
    ringColor: string
  ) => {
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size, size);

    const strokeWidth = 8 / size;
    ctx.lineWidth = strokeWidth;

    if (borderStyle.renderType === "classic-white") {
      ctx.strokeStyle = "#FFFFFF";
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "double") {
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 4 / size;
      ctx.stroke(new Path2D(d));
      // Outer border outline
      ctx.save();
      ctx.scale(1.04, 1.04);
      ctx.translate(-0.02, -0.02);
      ctx.lineWidth = 2 / size;
      ctx.stroke(new Path2D(d));
      ctx.restore();
    } else if (borderStyle.renderType === "gold") {
      const grad = ctx.createLinearGradient(0, 0, 1, 1);
      grad.addColorStop(0, "#D4AF37");
      grad.addColorStop(0.3, "#FFF9E6");
      grad.addColorStop(0.5, "#AA7C11");
      grad.addColorStop(0.8, "#FFF9E6");
      grad.addColorStop(1, "#D4AF37");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 10 / size;
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "rosegold") {
      const grad = ctx.createLinearGradient(0, 0, 1, 1);
      grad.addColorStop(0, "#B76E79");
      grad.addColorStop(0.5, "#FFD1DC");
      grad.addColorStop(1, "#B76E79");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 10 / size;
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "black") {
      ctx.strokeStyle = "#111827";
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "matte") {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 4 / size;
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "filmstrip") {
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 12 / size;
      ctx.stroke(new Path2D(d));
      ctx.strokeStyle = "#FFF";
      ctx.lineWidth = 2 / size;
      ctx.setLineDash([0.02, 0.04]);
      ctx.stroke(new Path2D(d));
      ctx.setLineDash([]);
    } else if (borderStyle.renderType === "neon") {
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#FFF";
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "gradient") {
      const grad = ctx.createLinearGradient(0, 0, 1, 1);
      grad.addColorStop(0, "#7C3AED");
      grad.addColorStop(0.5, "#EC4899");
      grad.addColorStop(1, "#06B6D4");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 10 / size;
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "sakura") {
      ctx.strokeStyle = "#FFB7C5";
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "silver") {
      const grad = ctx.createLinearGradient(0, 0, 1, 1);
      grad.addColorStop(0, "#C0C0C0");
      grad.addColorStop(0.5, "#FFFFFF");
      grad.addColorStop(1, "#808080");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 9 / size;
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "platinum") {
      const grad = ctx.createLinearGradient(0, 0, 1, 1);
      grad.addColorStop(0, "#E5E4E2");
      grad.addColorStop(0.5, "#F8FAFC");
      grad.addColorStop(1, "#B4B2B0");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 9 / size;
      ctx.stroke(new Path2D(d));
    } else if (borderStyle.renderType === "cyberpunk") {
      ctx.strokeStyle = "#EC4899";
      ctx.stroke(new Path2D(d));
      ctx.save();
      ctx.scale(1.03, 1.03);
      ctx.translate(-0.015, -0.015);
      ctx.strokeStyle = "#06B6D4";
      ctx.stroke(new Path2D(d));
      ctx.restore();
    } else {
      ctx.strokeStyle = ringColor;
      ctx.stroke(new Path2D(d));
    }

    ctx.restore();
  };

  // Main high-resolution Canvas composite assembly
  const composeFinalPhoto = useCallback((shots: { local: string; remote: string }[]) => {
    const canvas = canvasRef.current;
    if (!canvas || shots.length === 0) return;
    const p = paletteRef.current;
    const s = shapeRef.current;
    const b = backdropRef.current;
    const f = filterRef.current;
    const border = borderRef.current;
    const currentLayout = layoutRef.current;

    let W = 960;
    let H = 680;

    // Adjust canvas dimensions for vertical strips vs grids
    if (currentLayout === "strip3") {
      W = 540;
      H = 1200;
    } else if (currentLayout === "strip4") {
      W = 540;
      H = 1500;
    } else if (currentLayout === "grid4") {
      W = 900;
      H = 900;
    }

    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Paper backing background fill
    ctx.fillStyle = p.id === "coral" || p.id === "bloom" ? "#2a1a1e" : "#0d0e18";
    ctx.fillRect(0, 0, W, H);

    // Apply snapchat-style filter onto canvas draw operations
    if (f.cssVal !== "none") {
      ctx.filter = f.cssVal;
    }

    drawBackdropSprinkle(ctx, b.id, W, H, p.ring);

    // Composite layouts
    if (currentLayout === "single") {
      const size = 300;
      const cy = 250;
      const leftCx = W / 2 - 95;
      const rightCx = W / 2 + 95;

      const latestShot = shots[shots.length - 1];
      drawShapeImage(ctx, latestShot.remote, s.d, rightCx, cy, size);
      drawShapeImage(ctx, latestShot.local, s.d, leftCx, cy, size);

      ctx.filter = "none"; // reset filter for margins/paper
      drawShapeRim(ctx, s.d, leftCx, cy, size, border, p.ring);
      drawShapeRim(ctx, s.d, rightCx, cy, size, border, p.ring);

      const stripH = 150;
      ctx.fillStyle = p.paper;
      ctx.fillRect(0, H - stripH, W, stripH);

      ctx.fillStyle = p.ink;
      ctx.font = "600 26px var(--font-display), sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.caption, W / 2, H - stripH + 55);

      const dateStr = new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      ctx.font = "400 15px var(--font-mono), monospace";
      ctx.globalAlpha = 0.7;
      ctx.fillText(`same sky · ${dateStr}`, W / 2, H - stripH + 90);
    } 
    else if (currentLayout === "strip3" || currentLayout === "strip4") {
      // 3 or 4 photos vertical strip
      const rowCount = currentLayout === "strip3" ? 3 : 4;
      const boxSize = 200;
      const usableHeight = H - 180;
      const spacing = usableHeight / rowCount;

      for (let i = 0; i < rowCount; i++) {
        const shot = shots[i] || shots[shots.length - 1];
        if (!shot) continue;
        const cy = 130 + i * spacing;
        const leftCx = W / 2 - 105;
        const rightCx = W / 2 + 105;

        drawShapeImage(ctx, shot.remote, s.d, rightCx, cy, boxSize);
        drawShapeImage(ctx, shot.local, s.d, leftCx, cy, boxSize);

        ctx.filter = "none";
        drawShapeRim(ctx, s.d, leftCx, cy, boxSize, border, p.ring);
        drawShapeRim(ctx, s.d, rightCx, cy, boxSize, border, p.ring);
        if (f.cssVal !== "none") ctx.filter = f.cssVal;
      }

      ctx.filter = "none";
      const stripH = 120;
      ctx.fillStyle = p.paper;
      ctx.fillRect(0, H - stripH, W, stripH);

      ctx.fillStyle = p.ink;
      ctx.font = "600 20px var(--font-display), sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("same sky booth · strip cut", W / 2, H - stripH + 45);

      ctx.font = "400 13px var(--font-mono), monospace";
      ctx.globalAlpha = 0.7;
      ctx.fillText(new Date().toLocaleDateString(), W / 2, H - stripH + 75);
    } 
    else if (currentLayout === "grid4") {
      // 2x2 grid layout
      const boxSize = 210;
      const rowY1 = 200;
      const rowY2 = 500;
      const colX1 = W / 4;
      const colX2 = (3 * W) / 4;

      const points = [
        { cx: colX1, cy: rowY1 },
        { cx: colX2, cy: rowY1 },
        { cx: colX1, cy: rowY2 },
        { cx: colX2, cy: rowY2 }
      ];

      for (let i = 0; i < 4; i++) {
        const shot = shots[i] || shots[shots.length - 1];
        if (!shot) continue;
        const pt = points[i];

        // Draw local and remote slightly overlapped or combined in each slot
        drawShapeImage(ctx, shot.remote, s.d, pt.cx + 40, pt.cy, boxSize);
        drawShapeImage(ctx, shot.local, s.d, pt.cx - 40, pt.cy, boxSize);

        ctx.filter = "none";
        drawShapeRim(ctx, s.d, pt.cx - 40, pt.cy, boxSize, border, p.ring);
        drawShapeRim(ctx, s.d, pt.cx + 40, pt.cy, boxSize, border, p.ring);
        if (f.cssVal !== "none") ctx.filter = f.cssVal;
      }

      ctx.filter = "none";
      const stripH = 110;
      ctx.fillStyle = p.paper;
      ctx.fillRect(0, H - stripH, W, stripH);

      ctx.fillStyle = p.ink;
      ctx.font = "600 22px var(--font-display), sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("same sky booth · grid 4", W / 2, H - stripH + 45);
    }

    ctx.globalAlpha = 1;
    ctx.filter = "none";
    setPhoto(canvas.toDataURL("image/png"));
    setStage("result");
    setCountdown(null);
    setCurrentShotNumber(-1);
    log("High-resolution Polaroid photo composed.", "success");
  }, [log]);

  const processCaptureSequence = useCallback(async (shotsAccumulated: { local: string; remote: string }[]) => {
    const localVideo = localVideoRef.current;
    const remoteVideo = remoteVideoRef.current;
    if (!localVideo || !remoteVideo) return;

    // Determine how many captures needed
    let totalNeeded = 1;
    if (layoutRef.current === "strip2") totalNeeded = 2;
    else if (layoutRef.current === "strip3") totalNeeded = 3;
    else if (layoutRef.current === "strip4") totalNeeded = 4;
    else if (layoutRef.current === "grid4") totalNeeded = 4;

    const shotIndex = shotsAccumulated.length;
    setCurrentShotNumber(shotIndex + 1);

    // Save camera frame
    playShutter();
    if (flash) {
      setFlashActive(true);
      setTimeout(() => setFlashActive(false), 200);
    }

    const localFrame = captureCamFrame(localVideo, mirrorRef.current);
    const remoteFrame = captureCamFrame(remoteVideo, false);
    const nextShots = [...shotsAccumulated, { local: localFrame, remote: remoteFrame }];

    if (nextShots.length >= totalNeeded) {
      composeFinalPhoto(nextShots);
    } else {
      // Loop to next capture
      log(`Captured shot ${nextShots.length} of ${totalNeeded}. Next in 3 seconds…`);
      setCountdown(3);
      setTimeout(() => {
        processCaptureSequence(nextShots);
      }, 3000);
    }
  }, [flash, composeFinalPhoto, log]);

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
          // Launch the capture sequence loops
          setTimeout(() => processCaptureSequence([]), 100);
        } else {
          setCountdown(secs);
        }
      }, 100);
    },
    [processCaptureSequence]
  );

  const sendAppMessage = (msg: any) => {
    const ch = dataChannelRef.current;
    if (ch && ch.readyState === "open") {
      ch.send(JSON.stringify(msg));
    }
  };

  const sendStyle = useCallback(() => {
    sendAppMessage({
      type: "style",
      paletteId: paletteRef.current.id,
      shapeId: shapeRef.current.id,
      backdropId: backdropRef.current.id,
      filterId: filterRef.current.id,
      borderId: borderRef.current.id,
      layout: layoutRef.current,
      mirror: mirrorRef.current,
      density: densityRef.current,
      opacity: opacityRef.current
    });
  }, []);

  const wireDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.onopen = () => {
        setConnected(true);
        log("Connected successfully — selections synchronized.", "success");
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
            const f = FILTERS.find((x) => x.id === data.filterId);
            const br = BORDERS.find((x) => x.id === data.borderId);
            if (p) setPalette(p);
            if (s) setShape(s);
            if (b) setBackdrop(b);
            if (f) setSelectedFilter(f);
            if (br) setSelectedBorder(br);
            if (data.layout) setLayout(data.layout);
            if (data.mirror !== undefined) setMirror(data.mirror);
            if (data.density !== undefined) setDecDensity(data.density);
            if (data.opacity !== undefined) setDecOpacity(data.opacity);
          } else if (data?.type === "countdown") {
            log("Partner initiated the countdown.", "info");
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
          socketRef.current?.emit("signal", {
            type: "candidate",
            candidate: e.candidate.toJSON(),
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        log(
          `ICE state: ${state}`,
          state === "failed" ? "error" : state === "connected" || state === "completed" ? "success" : "info"
        );
        if (state === "failed") {
          setError("Couldn't establish connection. Try resetting or switching networks.");
        }
      };

      pc.ontrack = (e) => {
        log("Partner stream link active.", "success");
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
          remoteVideoRef.current.play().catch(() => {});
        }
        setStage((s) => (s === "result" ? s : "live"));
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
        log(`Failed ICE candidate queue: ${err.message}`, "error");
      }
    }
  }, [log]);

  const handleSignal = useCallback(
    async (data: any) => {
      if (data.type === "offer") {
        if (!pcRef.current) createPeerConnection(false);
        const pc = pcRef.current!;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushPendingCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit("signal", { type: "answer", sdp: answer });
      } else if (data.type === "answer") {
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
            log(`Failed ICE candidate: ${err.message}`, "error");
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

      log("Waking up photo-booth signaling server…");
      try {
        await fetch(`${SIGNALING_URL}/health`, { mode: "cors" });
      } catch (err) {}

      log(`Connecting to room room:${room}…`);
      const { io } = await import("socket.io-client");
      const socket = io(SIGNALING_URL, {
        transports: ["websocket", "polling"],
        timeout: 25000,
        reconnectionAttempts: 3,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("join", room);
      });

      socket.on("connect_error", () => {
        setError("Signaling link failed. Please check internet connection.");
      });

      socket.on("role", async (assignedRole: "host" | "guest") => {
        if (assignedRole === "guest") {
          const pc = createPeerConnection(true);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("signal", { type: "offer", sdp: offer });
        }
      });

      socket.on("peer-left", () => {
        setError("Partner disconnected.");
        setConnected(false);
      });

      socket.on("room-full", () => {
        setError("Session room is full.");
        setStage("setup");
      });

      socket.on("signal", (data: any) => {
        handleSignal(data).catch(() => {});
      });
    },
    [createPeerConnection, handleSignal, log]
  );

  const getCamera = async () => {
    log("Opening webcam…");
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
    } catch (err: any) {
      setError("Webcam permissions required.");
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
      setError("Please enter a valid booth code.");
      return;
    }
    try {
      await getCamera();
    } catch (err: any) {
      setError("Webcam permissions required.");
      return;
    }
    setStage("joining");
    connectSocket(target, "guest");
  };

  const applyTheme = (themeId: string) => {
    setSelectedTheme(themeId);
    if (themeId === "custom") return;

    const th = THEMES.find((x) => x.id === themeId);
    if (th) {
      const pal = PALETTES.find((x) => x.id === th.paletteId);
      const sh = SHAPES.find((x) => x.id === th.shapeId);
      const bd = BACKDROPS.find((x) => x.id === th.backdropId);
      const filt = FILTERS.find((x) => x.id === th.filterId);
      const bord = BORDERS.find((x) => x.id === th.borderId);

      if (pal) setPalette(pal);
      if (sh) setShape(sh);
      if (bd) setBackdrop(bd);
      if (filt) setSelectedFilter(filt);
      if (bord) setSelectedBorder(bord);

      setTimeout(() => sendStyle(), 50);
    }
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
    a.download = "samesky-polaroid.png";
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
        padding: "24px 16px 140px",
        background: palette.glow,
        transition: "background 0.5s ease",
      }}
    >
      {/* Visual shutter flash screen */}
      <div className={`shutter-flash ${flashActive ? "active" : ""}`} />

      {/* Header bar */}
      <header
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "between",
          marginBottom: 28,
          borderRadius: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>📸</span>
          <div>
            <h1 className="wordmark" style={{ fontSize: 20, margin: 0 }}>Same Sky</h1>
            <p style={{ fontSize: 10, color: "var(--secondary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Polaroid v2 Premium Booth</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
          {connected ? (
            <span className="recording-indicator" style={{ border: "1px solid var(--success)", color: "var(--success)" }}>
              <span className="recording-dot" style={{ backgroundColor: "var(--success)" }}></span> SYNCED
            </span>
          ) : (
            <span className="recording-indicator">
              <span className="recording-dot"></span> OFFLINE
            </span>
          )}
          <button className="btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} onClick={() => setDebugOpen(!debugOpen)}>
            ⚙️ Logs
          </button>
        </div>
      </header>

      {/* Stages layout */}
      {stage === "setup" && (
        <div className="glass-panel animate-fade-in" style={{ maxWidth: 480, width: "100%", padding: 36, textAlign: "center" }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>Luxury Self Photo Booth</p>
          <h2 style={{ fontSize: 32, marginBottom: 12 }}>Connect Cameras</h2>
          <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 28 }}>
            Synchronized countdowns, premium real-time filters, borders, and overlays. Connect with your partner to capture memories together.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ padding: 24, background: "rgba(255,255,255,0.02)", borderRadius: 16, border: "1px solid var(--glass-border)" }}>
              <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Create a New Booth</p>
              <button className="btn-primary" style={{ width: "100%" }} onClick={startHost}>
                Generate Code
              </button>
            </div>

            <div style={{ padding: 24, background: "rgba(255,255,255,0.02)", borderRadius: 16, border: "1px solid var(--glass-border)" }}>
              <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Enter Partner's Code</p>
              <input
                className="code-input"
                placeholder="00000"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                maxLength={5}
                style={{ marginBottom: 16 }}
              />
              <button className="btn-ghost" style={{ width: "100%" }} onClick={joinSession}>
                Connect Booth
              </button>
            </div>
          </div>

          {error && <p style={{ color: "var(--accent)", marginTop: 16, fontSize: 14 }}>{error}</p>}
        </div>
      )}

      {(stage === "waiting" || stage === "joining") && (
        <div className="glass-panel animate-fade-in" style={{ padding: 48, textAlign: "center", maxWidth: 440, width: "100%" }}>
          <p className="eyebrow" style={{ marginBottom: 14 }}>
            {stage === "waiting" ? "Waiting for Partner" : "Connecting Peer Links…"}
          </p>
          {stage === "waiting" && (
            <>
              <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 14 }}>
                Provide this session code to your partner to automatically link camera feeds.
              </p>
              <div
                className="wordmark"
                style={{
                  fontSize: 48,
                  letterSpacing: "0.12em",
                  marginBottom: 28,
                  textTransform: "uppercase",
                }}
              >
                {myCode}
              </div>
            </>
          )}
          <PulseDots color="var(--primary)" />
          {error && <p style={{ color: "var(--accent)", marginTop: 18, fontSize: 14 }}>{error}</p>}
        </div>
      )}

      {(stage === "live" || stage === "result") && (
        <div className="animate-fade-in" style={{ width: "100%", maxWidth: 960 }}>
          {stage === "live" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
              
              {/* Left Column: Live Camera Sandbox */}
              <div className="glass-panel" style={{ padding: 20 }}>
                {/* Floating Toggles HUD */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <span className="recording-indicator">
                    <span className="recording-dot"></span> Live webcam · {fps} FPS
                  </span>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn-ghost"
                      style={{ padding: "6px 12px", fontSize: 11, borderColor: grid ? "var(--secondary)" : "var(--glass-border)" }}
                      onClick={() => setGrid(!grid)}
                    >
                      Grid
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ padding: "6px 12px", fontSize: 11, borderColor: mirror ? "var(--secondary)" : "var(--glass-border)" }}
                      onClick={() => {
                        setMirror(!mirror);
                        setTimeout(() => sendStyle(), 50);
                      }}
                    >
                      Mirror
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ padding: "6px 12px", fontSize: 11, borderColor: flash ? "var(--secondary)" : "var(--glass-border)" }}
                      onClick={() => setFlash(!flash)}
                    >
                      Flash
                    </button>
                  </div>
                </div>

                {/* Main Camera Frame Viewport */}
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "1.4",
                    borderRadius: 20,
                    overflow: "hidden",
                    background: "#05050A",
                    border: "1px solid var(--glass-border)",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* Backdrop float animation particles overlay */}
                  <FloatingParticles backdrop={backdrop} ring={palette.ring} />

                  {/* Grid Lines */}
                  <div className={`camera-grid-overlay ${grid ? "active" : ""}`}>
                    <div></div><div></div><div></div>
                    <div></div><div></div><div></div>
                    <div></div><div></div><div></div>
                  </div>

                  {/* Synchronized feeds */}
                  <div style={{ display: "flex", gap: 16, zIndex: 1, position: "relative" }}>
                    <div
                      style={{
                        width: 200,
                        height: 200,
                        clipPath: `path("${scalePathD(shape.d, 200)}")`,
                        background: "#000",
                        position: "relative",
                        transition: "box-shadow 0.3s ease",
                      }}
                    >
                      {/* Left Cam Feed Frame border */}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          pointerEvents: "none",
                          border: selectedBorder.renderType === "classic-white" ? "4px solid #fff" : selectedBorder.renderType === "black" ? "4px solid #111" : "3px solid var(--primary)",
                          borderRadius: shape.id === "circle" ? "50%" : shape.id === "polaroid" ? "12px" : "0px",
                          zIndex: 5,
                        }}
                      />
                      <VisibleVideo videoRef={localVideoRef} mirrored={mirror} filterVal={selectedFilter.cssVal} brightness={brightness} exposure={exposure} />
                    </div>

                    <div
                      style={{
                        width: 200,
                        height: 200,
                        clipPath: `path("${scalePathD(shape.d, 200)}")`,
                        background: "#000",
                        position: "relative",
                      }}
                    >
                      {/* Right Cam Feed Frame border */}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          pointerEvents: "none",
                          border: selectedBorder.renderType === "classic-white" ? "4px solid #fff" : selectedBorder.renderType === "black" ? "4px solid #111" : "3px solid var(--primary)",
                          borderRadius: shape.id === "circle" ? "50%" : shape.id === "polaroid" ? "12px" : "0px",
                          zIndex: 5,
                        }}
                      />
                      <VisibleVideo videoRef={remoteVideoRef} mirrored={false} filterVal={selectedFilter.cssVal} brightness={brightness} exposure={exposure} />
                    </div>
                  </div>

                  {/* Countdown overlay numbers */}
                  {countdown !== null && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,0.4)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10,
                      }}
                    >
                      <div style={countdownOverlayStyle}>
                        {countdown > 0 ? countdown : "Flash!"}
                      </div>
                      {currentShotNumber > 0 && (
                        <p style={{ marginTop: 12, color: "var(--secondary)", fontWeight: 700, fontSize: 16 }}>
                          Taking Capture {currentShotNumber}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Sliders adjustments */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
                  <div>
                    <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 6 }}>Brightness</label>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={brightness}
                      onChange={(e) => setBrightness(parseFloat(e.target.value))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 6 }}>Contrast / Exposure</label>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={exposure}
                      onChange={(e) => setExposure(parseFloat(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Customizer sidebar Controls */}
              <div className="glass-panel" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 22 }}>
                
                {/* Theme Selector */}
                <div>
                  <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--secondary)", marginBottom: 10 }}>Theme presets</h4>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                    <button
                      className={`btn-ghost ${selectedTheme === "custom" ? "active" : ""}`}
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      onClick={() => applyTheme("custom")}
                    >
                      Custom
                    </button>
                    {THEMES.map((th) => (
                      <button
                        key={th.id}
                        className={`btn-ghost ${selectedTheme === th.id ? "active" : ""}`}
                        style={{ padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}
                        onClick={() => applyTheme(th.id)}
                      >
                        {th.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Photo Layout Options */}
                <div>
                  <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--secondary)", marginBottom: 10 }}>Photo Layout</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <button
                      className={`btn-ghost ${layout === "single" ? "active" : ""}`}
                      style={{ padding: "8px", fontSize: 12 }}
                      onClick={() => {
                        setLayout("single");
                        setTimeout(() => sendStyle(), 50);
                      }}
                    >
                      Single Frame
                    </button>
                    <button
                      className={`btn-ghost ${layout === "strip3" ? "active" : ""}`}
                      style={{ padding: "8px", fontSize: 12 }}
                      onClick={() => {
                        setLayout("strip3");
                        setTimeout(() => sendStyle(), 50);
                      }}
                    >
                      3-Cut Strip
                    </button>
                    <button
                      className={`btn-ghost ${layout === "strip4" ? "active" : ""}`}
                      style={{ padding: "8px", fontSize: 12 }}
                      onClick={() => {
                        setLayout("strip4");
                        setTimeout(() => sendStyle(), 50);
                      }}
                    >
                      4-Cut Strip
                    </button>
                    <button
                      className={`btn-ghost ${layout === "grid4" ? "active" : ""}`}
                      style={{ padding: "8px", fontSize: 12 }}
                      onClick={() => {
                        setLayout("grid4");
                        setTimeout(() => sendStyle(), 50);
                      }}
                    >
                      2x2 Grid
                    </button>
                  </div>
                </div>

                {/* Filter Carousel */}
                <div>
                  <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--secondary)", marginBottom: 10 }}>Snapchat Filters</h4>
                  <div className="carousel-container">
                    {FILTERS.map((f) => (
                      <div
                        key={f.id}
                        className={`carousel-card ${selectedFilter.id === f.id ? "active" : ""}`}
                        onClick={() => {
                          setSelectedFilter(f);
                          setSelectedTheme("custom");
                          setTimeout(() => sendStyle(), 50);
                        }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: f.swatch, border: "2px solid #FFF", marginBottom: 6 }} />
                        <span style={{ fontSize: 9, textAlign: "center", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", width: "100%" }}>{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Border Picker */}
                <div>
                  <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--secondary)", marginBottom: 10 }}>Borders Pack</h4>
                  <div className="carousel-container">
                    {BORDERS.map((br) => (
                      <div
                        key={br.id}
                        className={`carousel-card ${selectedBorder.id === br.id ? "active" : ""}`}
                        onClick={() => {
                          setSelectedBorder(br);
                          setSelectedTheme("custom");
                          setTimeout(() => sendStyle(), 50);
                        }}
                        style={{ width: 90 }}
                      >
                        <div style={{ width: 44, height: 28, border: "2px solid #fff", borderRadius: 4, background: "rgba(255,255,255,0.05)", marginBottom: 6 }} />
                        <span style={{ fontSize: 9, textAlign: "center", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", width: "100%" }}>{br.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Backdrop / Sparkles Selection */}
                <div>
                  <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--secondary)", marginBottom: 10 }}>Overlays</h4>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {BACKDROPS.map((bd) => (
                      <button
                        key={bd.id}
                        className={`btn-ghost ${backdrop.id === bd.id ? "active" : ""}`}
                        style={{ padding: "6px 12px", fontSize: 11 }}
                        onClick={() => {
                          setBackdrop(bd);
                          setSelectedTheme("custom");
                          setTimeout(() => sendStyle(), 50);
                        }}
                      >
                        {bd.label}
                      </button>
                    ))}
                  </div>

                  {backdrop.id !== "clear" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
                          <span>Density</span> <span>{decDensity}</span>
                        </label>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={decDensity}
                          onChange={(e) => {
                            setDecDensity(parseInt(e.target.value));
                            setTimeout(() => sendStyle(), 50);
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
                          <span>Opacity</span> <span>{Math.round(decOpacity * 100)}%</span>
                        </label>
                        <input
                          type="range"
                          min={0.2}
                          max={1.0}
                          step={0.1}
                          value={decOpacity}
                          onChange={(e) => {
                            setDecOpacity(parseFloat(e.target.value));
                            setTimeout(() => sendStyle(), 50);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Sparkle Window Shape Selection */}
                <div>
                  <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--secondary)", marginBottom: 10 }}>Window Shapes</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                    {SHAPES.map((sh) => (
                      <button
                        key={sh.id}
                        className={`btn-ghost ${shape.id === sh.id ? "active" : ""}`}
                        style={{ padding: "8px 4px", fontSize: 11 }}
                        onClick={() => {
                          setShape(sh);
                          setSelectedTheme("custom");
                          setTimeout(() => sendStyle(), 50);
                        }}
                      >
                        {sh.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Capture Trigger Button */}
                <button
                  className="btn-primary"
                  onClick={triggerCapture}
                  disabled={!connected || countdown !== null}
                  style={{ width: "100%", marginTop: 12, padding: "16px 0" }}
                >
                  {countdown !== null ? "Get Ready…" : "Capture Photo Strip"}
                </button>
              </div>
            </div>
          ) : (
            // Results Display Polaroid Mockup Card
            <div className="glass-panel" style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <p className="eyebrow" style={{ marginBottom: 16 }}>Captured Moment</p>

              <div
                style={{
                  background: "#FFF",
                  padding: "24px 24px 48px",
                  borderRadius: 8,
                  boxShadow: "0 30px 80px rgba(0,0,0,0.8), inset 0 0 100px rgba(0,0,0,0.05)",
                  maxWidth: 480,
                  width: "100%",
                  marginBottom: 36,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                {photo && (
                  <img
                    src={photo}
                    alt="Captured photo booth strip"
                    style={{
                      width: "100%",
                      borderRadius: 4,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                  />
                )}
              </div>

              <div style={{ display: "flex", gap: 16 }}>
                <button className="btn-ghost" style={{ padding: "14px 36px" }} onClick={retake}>
                  Retake Photo
                </button>
                <button className="btn-primary" style={{ padding: "14px 36px" }} onClick={downloadPhoto}>
                  Download PNG
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden processing pipelines */}
      <video ref={localVideoRef} muted playsInline style={{ display: "none" }} />
      <video ref={remoteVideoRef} muted playsInline style={{ display: "none" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <DebugPanel logs={logs} open={debugOpen} setOpen={setDebugOpen} />
    </main>
  );
}

/* -------------------------------- pieces -------------------------------- */

function PulseDots({ color = "var(--primary)" }: { color?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: color,
            animation: `pulseLine 1.2s ${i * 0.2}s infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
}

function FloatingParticles({ backdrop, ring }: { backdrop: BackdropStyle; ring: string }) {
  const bits = useMemo(() => {
    if (backdrop.id === "clear") return [];
    const count = 8;
    return Array.from({ length: count }).map((_, i) => ({
      left: 10 + ((i * 31) % 80),
      delay: (i % 4) * 0.8,
      duration: 6 + (i % 3) * 2,
      size: 10 + (i % 3) * 4,
    }));
  }, [backdrop.id]);

  if (backdrop.id === "clear") return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
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
              <path d={SHAPE_PATHS.heart} fill="#ff8fab" opacity={0.5} />
            </svg>
          )}
          {backdrop.id === "stardust" && (
            <span
              style={{
                display: "block",
                width: b.size * 0.4,
                height: b.size * 0.4,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.7)",
                boxShadow: "0 0 10px #FFF",
              }}
            />
          )}
          {backdrop.id === "confetti" && (
            <span
              style={{
                display: "block",
                width: b.size * 0.8,
                height: b.size * 0.35,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                opacity: 0.7,
              }}
            />
          )}
          {backdrop.id === "stars" && (
            <svg viewBox="0 0 24 24" width={b.size} height={b.size} fill={ring} opacity={0.5}>
              <path d="M12,2L14.8,8.2L21.6,9L16.5,13.6L18,20.3L12,16.8L6,20.3L7.5,13.6L2.4,9L9.2,8.2L12,2Z" />
            </svg>
          )}
          {backdrop.id === "flowers" && (
            <svg viewBox="0 0 24 24" width={b.size} height={b.size} fill="#FFB7C5" opacity={0.6}>
              <path d="M12,2A3,3 0 0,0 9,5A3,3 0 0,0 9.15,6.04C8,6.58 7.25,7.74 7.25,9.08C7.25,10.42 8,11.58 9.15,12.12C8,12.66 7.25,13.82 7.25,15.16C7.25,16.5 8,17.66 9.15,18.2C9.05,18.5 9,18.82 9,19.16A3,3 0 0,0 12,22.16A3,3 0 0,0 15,19.16C15,18.82 14.95,18.5 14.85,18.2C16,17.66 16.75,16.5 16.75,15.16C16.75,13.82 16,12.66 14.85,12.12C16,11.58 16.75,10.42 16.75,9.08C16.75,7.74 16,6.58 14.85,6.04A3,3 0 0,0 15,5A3,3 0 0,0 12,2Z" />
            </svg>
          )}
          {backdrop.id === "butterflies" && (
            <span style={{ fontSize: b.size * 0.8, opacity: 0.65 }}>🦋</span>
          )}
          {backdrop.id === "snow" && (
            <span style={{ fontSize: b.size * 0.8, opacity: 0.8 }}>❄️</span>
          )}
          {backdrop.id === "balloons" && (
            <span style={{ fontSize: b.size * 0.9, opacity: 0.7 }}>🎈</span>
          )}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------- windows -------------------------------- */

function VisibleVideo({
  videoRef,
  mirrored,
  filterVal,
  brightness,
  exposure,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  mirrored?: boolean;
  filterVal: string;
  brightness: number;
  exposure: number;
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

  // Combine snapchat filter with manual sliders
  const filterString = `${filterVal} brightness(${brightness}) contrast(${exposure})`;

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
        filter: filterString,
        transition: "filter 0.3s ease",
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
    info: "rgba(255,255,255,0.75)",
    success: "#22C55E",
    error: "#EC4899",
  };
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: open ? "40vh" : 0,
        background: "rgba(9,9,11,0.95)",
        borderTop: "1px solid var(--glass-border)",
        transition: "max-height 0.3s ease",
        overflow: "hidden",
        zIndex: 100,
      }}
    >
      <div
        style={{
          padding: 16,
          display: "flex",
          justifyContent: "between",
          alignItems: "center",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Connection Debug Logs</span>
        <button
          onClick={() => setOpen(false)}
          className="btn-ghost"
          style={{ padding: "4px 10px", fontSize: 11 }}
        >
          Close
        </button>
      </div>
      <div
        style={{
          padding: "16px",
          overflowY: "auto",
          maxHeight: "calc(40vh - 50px)",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {logs.length === 0 && (
          <p style={{ opacity: 0.5 }}>No operations logged yet.</p>
        )}
        {logs.map((l, i) => (
          <div key={i} style={{ color: levelColor[l.level] }}>
            <span style={{ opacity: 0.5 }}>{l.time}</span> {l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

const countdownOverlayStyle: React.CSSProperties = {
  fontFamily: "var(--font-display), sans-serif",
  fontSize: 96,
  fontWeight: 800,
  color: "#FFF",
  textShadow: "0 0 40px rgba(124,58,237,0.8), 0 0 10px rgba(0,0,0,0.5)",
  animation: "gentleBeat 1s ease-in-out infinite",
};