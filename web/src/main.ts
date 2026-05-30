import { FruitNinjaGame, renderLives } from "./game";
import { HandTracker } from "./handTracker";

const startScreen = document.getElementById("start-screen")!;
const loadingScreen = document.getElementById("loading-screen")!;
const gameScreen = document.getElementById("game-screen")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const startError = document.getElementById("start-error")!;
const video = document.getElementById("video") as HTMLVideoElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const scoreEl = document.getElementById("score")!;
const comboEl = document.getElementById("combo")!;
const livesEl = document.getElementById("lives")!;
const hintEl = document.getElementById("hint")!;
const gameOverEl = document.getElementById("game-over")!;
const finalScoreEl = document.getElementById("final-score")!;
const restartBtn = document.getElementById("restart-btn") as HTMLButtonElement;

const ctx = canvas.getContext("2d")!;
const tracker = new HandTracker();
let game: FruitNinjaGame | null = null;
let trail: Array<[number, number]> = [];
const TRAIL_MAX = 20;
let rafId = 0;
let lastFrame = performance.now();
let stream: MediaStream | null = null;

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

function updateHud(handVisible: boolean): void {
  if (!game) return;
  const st = game.state;
  scoreEl.textContent = `Score: ${st.score}`;
  livesEl.textContent = renderLives(st.lives);

  if (st.combo > 1) {
    comboEl.textContent = `Combo x${st.combo}!`;
    show(comboEl);
  } else {
    hide(comboEl);
  }

  if (handVisible) hide(hintEl);
  else show(hintEl);

  if (st.gameOver) {
    finalScoreEl.textContent = `Final score: ${st.score}`;
    show(gameOverEl);
  } else {
    hide(gameOverEl);
  }
}

function loop(): void {
  if (!game) return;

  const now = performance.now();
  const dt = now - lastFrame;
  lastFrame = now;

  const { w, h } = syncCanvasSize();
  const tip = tracker.fingertip(video, w, h);

  if (tip.visible) {
    trail.push([tip.x, tip.y]);
    if (trail.length > TRAIL_MAX) trail.shift();
  } else if (trail.length > 0) {
    trail.shift();
  }

  if (!game.state.gameOver) {
    game.update(trail, dt);
  }

  game.draw(ctx, trail);
  updateHud(tip.visible);

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
  trail = [];
  lastFrame = performance.now();
  stopLoop();
  rafId = requestAnimationFrame(loop);
}

function restartGame(): void {
  game?.reset();
  trail = [];
  hide(gameOverEl);
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

// Telegram / mobile: prevent pull-to-refresh while playing
document.body.addEventListener(
  "touchmove",
  (e) => {
    if (!gameScreen.classList.contains("hidden")) {
      e.preventDefault();
    }
  },
  { passive: false },
);
