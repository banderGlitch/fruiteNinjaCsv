import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export const INDEX_FINGER_TIP = 8;
export const INDEX_FINGER_PIP = 6;
export const INDEX_FINGER_MCP = 5;
export const MIDDLE_FINGER_TIP = 12;

/** MediaPipe hand skeleton edges (21 landmarks). */
export const HAND_CONNECTIONS: ReadonlyArray<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type Point2 = { x: number; y: number };

export type HandFrame = {
  landmarks: Point2[];
  fingertip: Point2;
  handVisible: boolean;
  indexExtended: boolean;
  handInFrame: boolean;
};

const EMPTY_FRAME: HandFrame = {
  landmarks: [],
  fingertip: { x: 0, y: 0 },
  handVisible: false,
  indexExtended: false,
  handInFrame: false,
};

function mirrorX(x: number, width: number): number {
  return (1 - x) * width;
}

function toPixel(lm: NormalizedLandmark, width: number, height: number): Point2 {
  return { x: mirrorX(lm.x, width), y: lm.y * height };
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Index finger clearly extended (tip farther from wrist than knuckle). */
export function isIndexExtended(landmarks: NormalizedLandmark[]): boolean {
  if (landmarks.length < 13) return false;

  const wrist = landmarks[0];
  const tip = landmarks[INDEX_FINGER_TIP];
  const pip = landmarks[INDEX_FINGER_PIP];
  const mcp = landmarks[INDEX_FINGER_MCP];
  const middleTip = landmarks[MIDDLE_FINGER_TIP];
  const middleMcp = landmarks[9];

  const tipFromWrist = dist(tip, wrist);
  const pipFromWrist = dist(pip, wrist);
  if (tipFromWrist <= pipFromWrist * 1.08) return false;

  const indexLen = dist(tip, mcp);
  const middleLen = dist(middleTip, middleMcp);
  if (indexLen <= middleLen * 0.72) return false;

  return tip.y < pip.y + 0.04;
}

/** All landmarks inside the frame with a small margin. */
export function isHandFullyInFrame(
  landmarks: NormalizedLandmark[],
  margin = 0.04,
): boolean {
  return landmarks.every(
    (lm) =>
      lm.x >= margin &&
      lm.x <= 1 - margin &&
      lm.y >= margin &&
      lm.y <= 1 - margin,
  );
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private timestampMs = 0;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    const opts = {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU" as const,
      },
      runningMode: "VIDEO" as const,
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, opts);
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...opts,
        baseOptions: { ...opts.baseOptions, delegate: "CPU" },
      });
    }
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }

  detect(
    video: HTMLVideoElement,
    width: number,
    height: number,
  ): HandFrame {
    if (!this.landmarker || video.readyState < 2) {
      return { ...EMPTY_FRAME };
    }

    this.timestampMs += 33;
    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, this.timestampMs);
    } catch {
      return { ...EMPTY_FRAME };
    }

    const hands = result.landmarks;
    if (!hands?.length) {
      return { ...EMPTY_FRAME };
    }

    const raw = hands[0];
    const landmarks = raw.map((lm) => toPixel(lm, width, height));
    const tip = landmarks[INDEX_FINGER_TIP];

    return {
      landmarks,
      fingertip: tip,
      handVisible: true,
      indexExtended: isIndexExtended(raw),
      handInFrame: isHandFullyInFrame(raw),
    };
  }
}

export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: HandFrame,
  options?: { highlightIndex?: boolean; dim?: number },
): void {
  if (!frame.handVisible || frame.landmarks.length < 21) return;

  const dim = options?.dim ?? 1;
  const alpha = 0.55 + 0.35 * dim;
  const lineW = 3 + dim;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const [a, b] of HAND_CONNECTIONS) {
    const p1 = frame.landmarks[a];
    const p2 = frame.landmarks[b];
    const isIndexBone = a === 5 || b === 5 || a === 6 || b === 6 || a === 7 || b === 7 || a === 8 || b === 8;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    if (options?.highlightIndex && isIndexBone && frame.indexExtended) {
      ctx.strokeStyle = `rgba(110, 231, 160, ${alpha})`;
      ctx.lineWidth = lineW + 2;
    } else {
      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha * 0.85})`;
      ctx.lineWidth = lineW;
    }
    ctx.stroke();
  }

  for (let i = 0; i < frame.landmarks.length; i++) {
    const p = frame.landmarks[i];
    const isIndexTip = i === INDEX_FINGER_TIP;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isIndexTip ? 10 : 5, 0, Math.PI * 2);
    if (isIndexTip && frame.indexExtended) {
      ctx.fillStyle = `rgba(110, 231, 160, ${alpha})`;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.fill();
    }
  }

  ctx.restore();
}
