import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

const INDEX_FINGER_TIP = 8;
const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type FingerPoint = { x: number; y: number; visible: boolean };

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

  /** Index fingertip in canvas pixels (mirrored like selfie view). */
  fingertip(
    video: HTMLVideoElement,
    width: number,
    height: number,
  ): FingerPoint {
    if (!this.landmarker || video.readyState < 2) {
      return { x: 0, y: 0, visible: false };
    }

    this.timestampMs += 33;
    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, this.timestampMs);
    } catch {
      return { x: 0, y: 0, visible: false };
    }

    const hands = result.landmarks;
    if (!hands?.length) {
      return { x: 0, y: 0, visible: false };
    }

    const tip = hands[0][INDEX_FINGER_TIP];
    const x = (1 - tip.x) * width;
    const y = tip.y * height;
    return { x, y, visible: true };
  }
}
