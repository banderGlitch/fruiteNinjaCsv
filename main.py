"""Hand Slice — Fruit Ninja-style game using webcam + MediaPipe hand tracking.

Run:
    python main.py

Controls:
    Move your index finger to slice fruit.
    ESC — quit
    R   — restart after game over
"""

from __future__ import annotations

import collections
import sys
import time

import cv2

from game import FruitNinjaGame
from hand_tracker import HandTracker


def main() -> int:
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Could not open webcam. Check camera permissions and try again.")
        return 1

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720

    tracker = HandTracker()
    game = FruitNinjaGame(width, height)
    trail: collections.deque[tuple[int, int]] = collections.deque(maxlen=24)

    window = "Hand Slice — Fruit Ninja CV"
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window, min(width, 1280), min(height, 720))

    prev_time = time.perf_counter()
    fps = 0.0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Webcam frame read failed.")
                break

            frame = cv2.flip(frame, 1)
            now = time.perf_counter()
            dt = min(now - prev_time, 0.05)
            prev_time = now
            fps = fps * 0.9 + (1.0 / dt if dt > 0 else 0) * 0.1

            tip = tracker.fingertip(frame, mirror=False)
            if tip.visible:
                trail.append((tip.x, tip.y))
            elif len(trail) > 0:
                trail.popleft()

            if not game.state.game_over:
                game.update(list(trail), dt)

            game.draw(frame, list(trail), fps)

            if not tip.visible:
                cv2.putText(
                    frame,
                    "Show your hand to the camera",
                    (width // 2 - 180, height // 2),
                    cv2.FONT_HERSHEY_DUPLEX,
                    0.75,
                    (0, 255, 255),
                    2,
                    cv2.LINE_AA,
                )

            cv2.imshow(window, frame)
            key = cv2.waitKey(1) & 0xFF
            if key == 27:
                break
            if key in (ord("r"), ord("R")):
                game.reset()
                trail.clear()
    finally:
        tracker.close()
        cap.release()
        cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    sys.exit(main())
