export type FruitKind = "orange" | "apple" | "watermelon" | "bomb";

const FRUIT_META: Record<
  FruitKind,
  { radius: number; points: number; color: string; stroke: string }
> = {
  orange: { radius: 38, points: 1, color: "#ff8c28", stroke: "#ffb366" },
  apple: { radius: 34, points: 2, color: "#dc3232", stroke: "#ff6666" },
  watermelon: { radius: 48, points: 3, color: "#3cb458", stroke: "#6ee7a0" },
  bomb: { radius: 32, points: 0, color: "#282828", stroke: "#555" },
};

export type Fruit = {
  kind: FruitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  sliced: boolean;
  sliceTime: number;
};

export type ScorePopup = {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
  ttl: number;
};

export type GameState = {
  score: number;
  lives: number;
  gameOver: boolean;
  fruits: Fruit[];
  popups: ScorePopup[];
  lastSpawn: number;
  spawnInterval: number;
  combo: number;
  lastSliceTime: number;
};

function scaleRadius(base: number, w: number): number {
  return Math.round(base * Math.min(1.2, Math.max(0.55, w / 720)));
}

function spawnFruit(width: number, height: number): Fruit {
  const roll = Math.random();
  let kind: FruitKind;
  if (roll < 0.08) kind = "bomb";
  else if (roll < 0.45) kind = "orange";
  else if (roll < 0.75) kind = "apple";
  else kind = "watermelon";

  const meta = FRUIT_META[kind];
  const r = scaleRadius(meta.radius, width);
  const x = r + 20 + Math.random() * (width - 2 * r - 40);
  const y = height + r;
  const speed = height / 720;
  return {
    kind,
    x,
    y,
    vx: (Math.random() - 0.5) * 5.6 * speed,
    vy: (-12.5 - Math.random() * 4) * speed,
    radius: r,
    sliced: false,
    sliceTime: 0,
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
  padding = 10,
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
    this.gravity = 0.38 * (height / 720);
    this.state = this.freshState();
  }

  private freshState(): GameState {
    return {
      score: 0,
      lives: 5,
      gameOver: false,
      fruits: [],
      popups: [],
      lastSpawn: performance.now(),
      spawnInterval: 850,
      combo: 0,
      lastSliceTime: 0,
    };
  }

  reset(): void {
    this.state = this.freshState();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.gravity = 0.38 * (height / 720);
  }

  update(trail: ReadonlyArray<[number, number]>, dtMs: number): void {
    const st = this.state;
    if (st.gameOver) return;

    const now = performance.now();
    const dt = Math.min(dtMs, 50) / (1000 / 60);

    if (now - st.lastSpawn >= st.spawnInterval) {
      st.fruits.push(spawnFruit(this.width, this.height));
      st.lastSpawn = now;
      st.spawnInterval = Math.max(450, st.spawnInterval - 4);
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
      if (fruit.sliced) {
        fruit.sliceTime += dt / 60;
        if (fruit.sliceTime > 1.2) {
          st.fruits = st.fruits.filter((f) => f !== fruit);
        }
        continue;
      }

      fruit.vy += this.gravity;
      fruit.x += fruit.vx;
      fruit.y += fruit.vy;

      if (fruit.y - fruit.radius > this.height + 40 && fruit.kind !== "bomb") {
        st.fruits = st.fruits.filter((f) => f !== fruit);
        st.lives -= 1;
        st.combo = 0;
        if (st.lives <= 0) st.gameOver = true;
      } else if (
        fruit.y + fruit.radius < -60 ||
        fruit.x < -80 ||
        fruit.x > this.width + 80
      ) {
        st.fruits = st.fruits.filter((f) => f !== fruit);
      }
    }

    st.popups = st.popups.filter((p) => now - p.born < p.ttl);
  }

  private sliceFruit(fruit: Fruit, now: number): void {
    const st = this.state;
    fruit.sliced = true;
    fruit.sliceTime = 0;

    if (fruit.kind === "bomb") {
      st.lives -= 1;
      st.combo = 0;
      st.popups.push({
        x: fruit.x,
        y: fruit.y,
        text: "BOOM!",
        color: "#f87171",
        born: now,
        ttl: 700,
      });
      if (st.lives <= 0) st.gameOver = true;
      return;
    }

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
      text: `+${gained}`,
      color: "#fde047",
      born: now,
      ttl: 700,
    });
  }

  draw(
    ctx: CanvasRenderingContext2D,
    trail: ReadonlyArray<[number, number]>,
  ): void {
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawTrail(ctx, trail);
    for (const fruit of this.state.fruits) {
      this.drawFruit(ctx, fruit);
    }
    this.drawPopups(ctx);
  }

  private drawTrail(
    ctx: CanvasRenderingContext2D,
    trail: ReadonlyArray<[number, number]>,
  ): void {
    if (trail.length < 2) {
      if (trail.length === 1) {
        ctx.beginPath();
        ctx.arc(trail[0][0], trail[0][1], 10, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(110, 231, 160, 0.9)";
        ctx.fill();
      }
      return;
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < trail.length; i++) {
      const t = i / trail.length;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1][0], trail[i - 1][1]);
      ctx.lineTo(trail[i][0], trail[i][1]);
      ctx.strokeStyle = `rgba(${Math.round(80 + 100 * t)}, 255, ${Math.round(120 + 80 * t)}, ${0.45 + 0.45 * t})`;
      ctx.lineWidth = 4 + t * 14;
      ctx.stroke();
    }

    const last = trail[trail.length - 1];
    ctx.beginPath();
    ctx.arc(last[0], last[1], 8, 0, Math.PI * 2);
    ctx.fillStyle = "#b4ffc8";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(last[0], last[1], 4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  private drawFruit(ctx: CanvasRenderingContext2D, fruit: Fruit): void {
    const meta = FRUIT_META[fruit.kind];
    const { x, y, radius } = fruit;

    if (fruit.kind === "bomb" && !fruit.sliced) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = meta.color;
      ctx.fill();
      ctx.strokeStyle = meta.stroke;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 14);
      ctx.lineTo(x + 14, y + 14);
      ctx.moveTo(x + 14, y - 14);
      ctx.lineTo(x - 14, y + 14);
      ctx.stroke();
      return;
    }

    if (fruit.sliced) {
      const off = 12 + fruit.sliceTime * 28;
      for (const dx of [-off, off]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + 4, Math.max(8, radius - 6), 0, Math.PI * 2);
        ctx.fillStyle = meta.color;
        ctx.fill();
      }
      return;
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = meta.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - radius / 4, y - radius / 4, radius / 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
    ctx.strokeStyle = meta.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    for (const p of this.state.popups) {
      const age = now - p.born;
      const yOff = (age / p.ttl) * 40;
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x - 20, p.y - yOff);
    }
  }
}

export function renderLives(count: number): string {
  return "❤️".repeat(Math.max(0, count));
}
