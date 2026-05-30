export type FruitKind = "orange" | "apple" | "watermelon" | "bomb";

const FRUIT_META: Record<
  FruitKind,
  {
    radius: number;
    points: number;
    color: string;
    colorDark: string;
    stroke: string;
    juice: string;
  }
> = {
  orange: {
    radius: 38,
    points: 1,
    color: "#ff9a3c",
    colorDark: "#e86a10",
    stroke: "#ffc285",
    juice: "#ffb347",
  },
  apple: {
    radius: 34,
    points: 2,
    color: "#ef4444",
    colorDark: "#b91c1c",
    stroke: "#fca5a5",
    juice: "#f87171",
  },
  watermelon: {
    radius: 48,
    points: 3,
    color: "#4ade80",
    colorDark: "#16a34a",
    stroke: "#86efac",
    juice: "#bbf7d0",
  },
  bomb: {
    radius: 32,
    points: 0,
    color: "#1f1f1f",
    colorDark: "#0a0a0a",
    stroke: "#555",
    juice: "#444",
  },
};

/** Higher launch + lighter gravity = fruit flies further up. */
const LAUNCH_VY_MIN = 22;
const LAUNCH_VY_MAX = 30;
const GRAVITY_BASE = 0.26;
const AIR_DRAG = 0.998;

export type Fruit = {
  kind: FruitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  spin: number;
  sliced: boolean;
  sliceTime: number;
  pulse: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

export type ScorePopup = {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
  ttl: number;
  scale: number;
};

export type GameState = {
  score: number;
  gameOver: boolean;
  fruits: Fruit[];
  particles: Particle[];
  popups: ScorePopup[];
  lastSpawn: number;
  spawnInterval: number;
  spawnCount: number;
  combo: number;
  lastSliceTime: number;
  sliceFlash: number;
};

/** Set false to re-enable lives and game-over. */
export const TEST_MODE = true;

function scaleRadius(base: number, w: number): number {
  return Math.round(base * Math.min(1.2, Math.max(0.55, w / 720)));
}

function spawnFruit(width: number, height: number, kind?: FruitKind): Fruit {
  const roll = Math.random();
  const picked: FruitKind =
    kind ??
    (roll < 0.07
      ? "bomb"
      : roll < 0.42
        ? "orange"
        : roll < 0.72
          ? "apple"
          : "watermelon");

  const meta = FRUIT_META[picked];
  const r = scaleRadius(meta.radius, width);
  const x = r + 24 + Math.random() * (width - 2 * r - 48);
  const y = height + r + 8;
  const speed = height / 720;

  return {
    kind: picked,
    x,
    y,
    vx: (Math.random() - 0.5) * 7.5 * speed,
    vy: -(LAUNCH_VY_MIN + Math.random() * (LAUNCH_VY_MAX - LAUNCH_VY_MIN)) * speed,
    radius: r,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.14,
    sliced: false,
    sliceTime: 0,
    pulse: Math.random() * Math.PI * 2,
  };
}

function segmentHitsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
  padding = 12,
): boolean {
  const r = radius + padding;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(cx - x1, cy - y1) <= r;
  }
  const t = Math.max(
    0,
    Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / (dx * dx + dy * dy)),
  );
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return Math.hypot(cx - nx, cy - ny) <= r;
}

function trailSegments(
  trail: ReadonlyArray<[number, number]>,
): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (let i = 1; i < trail.length; i++) {
    out.push([trail[i - 1][0], trail[i - 1][1], trail[i][0], trail[i][1]]);
  }
  return out;
}

export class FruitNinjaGame {
  private width: number;
  private height: number;
  state: GameState;
  private gravity: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.gravity = GRAVITY_BASE * (height / 720);
    this.state = this.freshState();
  }

  private freshState(): GameState {
    return {
      score: 0,
      gameOver: false,
      fruits: [],
      particles: [],
      popups: [],
      lastSpawn: performance.now(),
      spawnInterval: 780,
      spawnCount: 0,
      combo: 0,
      lastSliceTime: 0,
      sliceFlash: 0,
    };
  }

  reset(): void {
    this.state = this.freshState();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.gravity = GRAVITY_BASE * (height / 720);
  }

  private spawnWave(now: number): void {
    const st = this.state;
    st.spawnCount += 1;

    if (st.spawnCount % 5 === 0) {
      const kinds: FruitKind[] = ["orange", "apple", "watermelon"];
      const slots = 3;
      const gap = this.width / (slots + 1);
      for (let i = 0; i < slots; i++) {
        const f = spawnFruit(this.width, this.height, kinds[i % kinds.length]);
        f.x = gap * (i + 1) + (Math.random() - 0.5) * 40;
        f.vy *= 1.08;
        st.fruits.push(f);
      }
      st.lastSpawn = now;
      return;
    }

    st.fruits.push(spawnFruit(this.width, this.height));
    st.lastSpawn = now;
    st.spawnInterval = Math.max(420, st.spawnInterval - 3);
  }

  update(trail: ReadonlyArray<[number, number]>, dtMs: number): void {
    const st = this.state;
    if (st.gameOver) return;

    const now = performance.now();
    const dt = Math.min(dtMs, 50) / (1000 / 60);

    if (now - st.lastSpawn >= st.spawnInterval) {
      this.spawnWave(now);
    }

    if (st.sliceFlash > 0) {
      st.sliceFlash = Math.max(0, st.sliceFlash - dt * 0.12);
    }

    const segments = trailSegments(trail);
    for (const fruit of st.fruits) {
      if (fruit.sliced) continue;
      for (const [x1, y1, x2, y2] of segments) {
        if (segmentHitsCircle(x1, y1, x2, y2, fruit.x, fruit.y, fruit.radius)) {
          this.sliceFruit(fruit, now);
          break;
        }
      }
    }

    for (const fruit of [...st.fruits]) {
      fruit.pulse += 0.08;

      if (fruit.sliced) {
        fruit.sliceTime += dt / 60;
        fruit.vy += this.gravity * 0.6;
        fruit.y += fruit.vy;
        if (fruit.sliceTime > 1.2) {
          st.fruits = st.fruits.filter((f) => f !== fruit);
        }
        continue;
      }

      fruit.vy += this.gravity;
      fruit.vx *= AIR_DRAG;
      fruit.x += fruit.vx;
      fruit.y += fruit.vy;
      fruit.rotation += fruit.spin;

      if (fruit.y - fruit.radius > this.height + 40 && fruit.kind !== "bomb") {
        st.fruits = st.fruits.filter((f) => f !== fruit);
        if (!TEST_MODE) st.combo = 0;
      } else if (
        fruit.y + fruit.radius < -120 ||
        fruit.x < -100 ||
        fruit.x > this.width + 100
      ) {
        st.fruits = st.fruits.filter((f) => f !== fruit);
      }
    }

    st.particles = st.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += this.gravity * 0.35;
      p.vx *= 0.98;
      return p.life > 0;
    });

    st.popups = st.popups.filter((p) => now - p.born < p.ttl);
  }

  private emitJuice(fruit: Fruit, count = 16): void {
    const meta = FRUIT_META[fruit.kind];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.state.particles.push({
        x: fruit.x,
        y: fruit.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 18 + Math.random() * 22,
        maxLife: 40,
        color: meta.juice,
        size: 3 + Math.random() * 5,
      });
    }
  }

  private sliceFruit(fruit: Fruit, now: number): void {
    const st = this.state;
    fruit.sliced = true;
    fruit.sliceTime = 0;

    if (fruit.kind === "bomb") {
      st.combo = 0;
      st.sliceFlash = 0;
      st.popups.push({
        x: fruit.x,
        y: fruit.y,
        text: "BOOM!",
        color: "#f87171",
        born: now,
        ttl: 800,
        scale: 1.2,
      });
      for (let i = 0; i < 24; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 8;
        st.particles.push({
          x: fruit.x,
          y: fruit.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 12 + Math.random() * 18,
          maxLife: 30,
          color: i % 2 ? "#f87171" : "#444",
          size: 4 + Math.random() * 6,
        });
      }
      return;
    }

    st.sliceFlash = 1;
    this.emitJuice(fruit);

    if (now - st.lastSliceTime < 350) st.combo += 1;
    else st.combo = 1;
    st.lastSliceTime = now;
    const bonus = Math.min(st.combo - 1, 5);
    const meta = FRUIT_META[fruit.kind];
    const gained = meta.points + bonus;
    st.score += gained;
    st.popups.push({
      x: fruit.x,
      y: fruit.y - 20,
      text: st.combo > 1 ? `+${gained} x${st.combo}` : `+${gained}`,
      color: "#fde047",
      born: now,
      ttl: 750,
      scale: 1 + Math.min(st.combo * 0.08, 0.5),
    });
  }

  draw(
    ctx: CanvasRenderingContext2D,
    trail: ReadonlyArray<[number, number]>,
  ): void {
    this.drawSliceFlash(ctx);
    for (const fruit of this.state.fruits) {
      this.drawFruit(ctx, fruit);
    }
    this.drawParticles(ctx);
    this.drawTrail(ctx, trail);
    this.drawPopups(ctx);
  }

  private drawSliceFlash(ctx: CanvasRenderingContext2D): void {
    const f = this.state.sliceFlash;
    if (f <= 0) return;
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${f * 0.07})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  private drawTrail(
    ctx: CanvasRenderingContext2D,
    trail: ReadonlyArray<[number, number]>,
  ): void {
    if (trail.length < 2) {
      if (trail.length === 1) {
        ctx.save();
        ctx.shadowColor = "#6ee7a0";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(trail[0][0], trail[0][1], 11, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(110, 231, 160, 0.95)";
        ctx.fill();
        ctx.restore();
      }
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "#6ee7a0";
    ctx.shadowBlur = 14;

    for (let i = 1; i < trail.length; i++) {
      const t = i / trail.length;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1][0], trail[i - 1][1]);
      ctx.lineTo(trail[i][0], trail[i][1]);
      ctx.strokeStyle = `rgba(${Math.round(100 + 90 * t)}, 255, ${Math.round(140 + 90 * t)}, ${0.5 + 0.45 * t})`;
      ctx.lineWidth = 5 + t * 16;
      ctx.stroke();
    }

    const last = trail[trail.length - 1];
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(last[0], last[1], 9, 0, Math.PI * 2);
    ctx.fillStyle = "#b4ffc8";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(last[0], last[1], 4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.state.particles) {
      const alpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawFruit(ctx: CanvasRenderingContext2D, fruit: Fruit): void {
    const meta = FRUIT_META[fruit.kind];
    const { x, y, radius, rotation } = fruit;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    if (fruit.kind === "bomb" && !fruit.sliced) {
      const pulse = 1 + Math.sin(fruit.pulse) * 0.06;
      const r = radius * pulse;
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      grad.addColorStop(0, "#3a3a3a");
      grad.addColorStop(1, meta.colorDark);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "#f87171";
      ctx.beginPath();
      ctx.moveTo(-12, -12);
      ctx.lineTo(12, 12);
      ctx.moveTo(12, -12);
      ctx.lineTo(-12, 12);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (fruit.sliced) {
      const off = 12 + fruit.sliceTime * 32;
      for (const dx of [-off, off]) {
        ctx.beginPath();
        ctx.arc(dx, 4, Math.max(8, radius - 6), 0, Math.PI * 2);
        const g = ctx.createRadialGradient(dx - 4, 0, 2, dx, 4, radius);
        g.addColorStop(0, meta.color);
        g.addColorStop(1, meta.colorDark);
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    const grad = ctx.createRadialGradient(
      -radius * 0.35,
      -radius * 0.35,
      radius * 0.15,
      0,
      0,
      radius,
    );
    grad.addColorStop(0, meta.color);
    grad.addColorStop(0.55, meta.color);
    grad.addColorStop(1, meta.colorDark);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-radius / 4, -radius / 4, radius / 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();

    ctx.strokeStyle = meta.stroke;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (fruit.kind === "watermelon") {
      ctx.strokeStyle = "rgba(20,80,30,0.5)";
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-radius * 0.8, i * 6);
        ctx.lineTo(radius * 0.8, i * 6);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    for (const p of this.state.popups) {
      const age = now - p.born;
      const t = age / p.ttl;
      const yOff = t * 48;
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.round(22 * p.scale)}px system-ui, sans-serif`;
      ctx.fillStyle = p.color;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 6;
      ctx.fillText(p.text, p.x - 24, p.y - yOff);
      ctx.restore();
    }
  }
}

export function loadBestScore(): number {
  try {
    return Number(localStorage.getItem("handSliceBest") ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): number {
  const best = Math.max(loadBestScore(), score);
  try {
    localStorage.setItem("handSliceBest", String(best));
  } catch {
    /* private mode */
  }
  return best;
}
