import { FruitNinjaGame, loadBestScore, saveBestScore } from "./game";
import { drawHandSkeleton, HandTracker, type HandFrame } from "./handTracker";

type Phase = "calibrate" | "playing";

const startScreen = document.getElementById("start-screen")!;
const loadingScreen = document.getElementById("loading-screen")!;
const gameScreen = document.getElementById("game-screen")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const startError = document.getElementById("start-error")!;
const video = document.getElementById("video") as HTMLVideoElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const scoreEl = document.getElementById("score")!;
const bestScoreEl = document.getElementById("best-score")!;
const comboEl = document.getElementById("combo")!;
const calibratePanel = document.getElementById("calibrate-panel")!;
const calibrateTitle = document.getElementById("calibrate-title")!;
const calibrateHint = document.getElementById("calibrate-hint")!;
const calibrateProgress = document.getElementById("calibrate-progress")!;
const goFlash = document.getElementById("go-flash")!;
const restartBtn = document.getElementById("restart-btn") as HTMLButtonElement;

const ctx = canvas.getContext("2d")!;
const tracker = new HandTracker();
let game: FruitNinjaGame | null = null;
let phase: Phase = "calibrate";
let trail: Array<[number, number]> = [];
const TRAIL_MAX = 20;
let rafId = 0;
let lastFrame = performance.now();
let stream: MediaStream | null = null;
let readyFrames = 0;
const READY_FRAMES_NEEDED = 24;

function show(el: HTMLElement): void {
  el.classList.remove("hidden");
}

function hide(el: HTMLElement): void {
  el.classList.add("hidden");
}

function setError(msg: string): void {
  startError.textContent = msg;
  show(startError);
}

async function startCamera(): Promise<void> {
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
    },
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      setError(
        "Camera blocked. Allow camera in browser settings, then reload.",
      );
    } else if (name === "NotFoundError") {
      setError("No front camera found on this device.");
    } else {
      setError("Could not open camera. Try Chrome or Safari on HTTPS.");
    }
    throw err;
  }

  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  await video.play();
}

function syncCanvasSize(): { w: number; h: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game?.resize(w, h);
  return { w, h };
}

function isReadyPose(frame: HandFrame): boolean {
  return frame.handVisible && frame.handInFrame && frame.indexExtended;
}

function updateCalibrateUi(frame: HandFrame): void {
  const pct = Math.min(100, Math.round((readyFrames / READY_FRAMES_NEEDED) * 100));
  calibrateProgress.style.width = `${pct}%`;

  if (!frame.handVisible) {
    calibrateTitle.textContent = "Show your full hand";
    calibrateHint.textContent = "Keep your whole hand inside the frame";
    return;
  }

  if (!frame.handInFrame) {
    calibrateTitle.textContent = "Move hand into view";
    calibrateHint.textContent = "Wrist and fingers should all be visible";
    return;
  }

  if (!frame.indexExtended) {
    calibrateTitle.textContent = "Point your index finger";
    calibrateHint.textContent = "Extend index finger — other fingers relaxed";
    return;
  }

  calibrateTitle.textContent = "Hold index finger…";
  calibrateHint.textContent = `Starting in ${Math.ceil((READY_FRAMES_NEEDED - readyFrames) / 24)}s`;
}

let bestScore = loadBestScore();
bestScoreEl.textContent = `Best: ${bestScore}`;

function drawVignette(w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.85);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function updateHud(): void {
  if (!game) return;
  const st = game.state;
  scoreEl.textContent = `Score: ${st.score}`;
  bestScore = saveBestScore(st.score);
  bestScoreEl.textContent = `Best: ${bestScore}`;

  if (st.combo > 1) {
    comboEl.textContent = `Combo x${st.combo}!`;
    show(comboEl);
  } else {
    hide(comboEl);
  }
}

function beginPlaying(): void {
  phase = "playing";
  readyFrames = 0;
  trail = [];
  hide(calibratePanel);
  show(restartBtn);
  show(goFlash);
  window.setTimeout(() => hide(goFlash), 900);
}

function enterCalibrate(): void {
  phase = "calibrate";
  readyFrames = 0;
  trail = [];
  game?.reset();
  show(calibratePanel);
  hide(restartBtn);
  calibrateProgress.style.width = "0%";
}

function updateTrail(frame: HandFrame): void {
  const canSlice = frame.handVisible && frame.indexExtended;
  if (canSlice) {
    trail.push([frame.fingertip.x, frame.fingertip.y]);
    if (trail.length > TRAIL_MAX) trail.shift();
  } else if (trail.length > 0) {
    trail.shift();
  }
}

function loop(): void {
  if (!game) return;

  const now = performance.now();
  const dt = now - lastFrame;
  lastFrame = now;

  const { w, h } = syncCanvasSize();
  const frame = tracker.detect(video, w, h);

  ctx.clearRect(0, 0, w, h);

  if (phase === "calibrate") {
    drawHandSkeleton(ctx, frame, { highlightIndex: true, dim: 1 });

    if (isReadyPose(frame)) {
      readyFrames += 1;
      if (readyFrames >= READY_FRAMES_NEEDED) {
        beginPlaying();
      }
    } else {
      readyFrames = Math.max(0, readyFrames - 2);
    }

    updateCalibrateUi(frame);
  } else {
    drawHandSkeleton(ctx, frame, {
      highlightIndex: frame.indexExtended,
      dim: 0.45,
    });
    updateTrail(frame);

    if (!game.state.gameOver) {
      game.update(trail, dt);
    }

    game.draw(ctx, trail);
    drawVignette(w, h);
    updateHud();
  }

  rafId = requestAnimationFrame(loop);
}

function stopLoop(): void {
  cancelAnimationFrame(rafId);
}

async function bootGame(): Promise<void> {
  hide(startScreen);
  show(loadingScreen);
  startError.classList.add("hidden");

  try {
    await startCamera();
    await tracker.init();
  } catch {
    hide(loadingScreen);
    show(startScreen);
    return;
  }

  hide(loadingScreen);
  show(gameScreen);

  const { w, h } = syncCanvasSize();
  game = new FruitNinjaGame(w, h);
  enterCalibrate();
  lastFrame = performance.now();
  stopLoop();
  rafId = requestAnimationFrame(loop);
}

function restartGame(): void {
  enterCalibrate();
}

function teardown(): void {
  stopLoop();
  tracker.close();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

startBtn.addEventListener("click", () => {
  void bootGame();
});

restartBtn.addEventListener("click", () => {
  restartGame();
});

window.addEventListener("resize", () => syncCanvasSize());
window.addEventListener("pagehide", teardown);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLoop();
  } else if (game) {
    lastFrame = performance.now();
    rafId = requestAnimationFrame(loop);
  }
});

document.body.addEventListener(
  "touchmove",
  (e) => {
    if (!gameScreen.classList.contains("hidden")) {
      e.preventDefault();
    }
  },
  { passive: false },
);
