"""MediaPipe Hand Landmarker — index finger tip for slicing."""

from __future__ import annotations

import urllib.request
from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIR / "hand_landmarker.task"

INDEX_FINGER_TIP = 8


@dataclass
class FingerPoint:
    x: int
    y: int
    visible: bool


def ensure_model() -> Path:
    """Download the hand landmarker model on first run."""
    if MODEL_PATH.is_file():
        return MODEL_PATH
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading hand landmarker model to {MODEL_PATH} ...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("Model ready.")
    return MODEL_PATH


class HandTracker:
    """Tracks the index fingertip in webcam frames."""

    def __init__(
        self,
        *,
        max_hands: int = 1,
        detection_confidence: float = 0.6,
        tracking_confidence: float = 0.6,
    ) -> None:
        model_path = ensure_model()
        options = vision.HandLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=max_hands,
            min_hand_detection_confidence=detection_confidence,
            min_hand_presence_confidence=detection_confidence,
            min_tracking_confidence=tracking_confidence,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)
        self._timestamp_ms = 0

    def close(self) -> None:
        self._landmarker.close()

    def fingertip(self, frame_bgr: np.ndarray, *, mirror: bool = True) -> FingerPoint:
        """Return index fingertip pixel coords for the first detected hand."""
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        self._timestamp_ms += 33
        result = self._landmarker.detect_for_video(mp_image, self._timestamp_ms)

        if not result.hand_landmarks:
            return FingerPoint(0, 0, False)

        tip = result.hand_landmarks[0][INDEX_FINGER_TIP]
        x = int(tip.x * w)
        y = int(tip.y * h)
        if mirror:
            x = w - x
        return FingerPoint(x, y, True)
