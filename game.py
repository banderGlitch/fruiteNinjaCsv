"""Fruit Ninja-style game logic: spawn, slice, score, lives."""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Sequence

import cv2
import numpy as np


class FruitKind(str, Enum):
    ORANGE = "orange"
    APPLE = "apple"
    WATERMELON = "watermelon"
    BOMB = "bomb"


FRUIT_META: dict[FruitKind, dict] = {
    FruitKind.ORANGE: {"radius": 38, "points": 1, "color": (40, 140, 255)},
    FruitKind.APPLE: {"radius": 34, "points": 2, "color": (50, 50, 220)},
    FruitKind.WATERMELON: {"radius": 48, "points": 3, "color": (60, 180, 80)},
    FruitKind.BOMB: {"radius": 32, "points": 0, "color": (40, 40, 40)},
}


@dataclass
class Fruit:
    kind: FruitKind
    x: float
    y: float
    vx: float
    vy: float
    radius: int
    sliced: bool = False
    slice_angle: float = 0.0
    slice_time: float = 0.0
    half_vx: tuple[float, float] = (0.0, 0.0)
    half_vy: tuple[float, float] = (0.0, 0.0)

    @property
    def is_bomb(self) -> bool:
        return self.kind == FruitKind.BOMB

    @property
    def points(self) -> int:
        return FRUIT_META[self.kind]["points"]


@dataclass
class ScorePopup:
    x: int
    y: int
    text: str
    color: tuple[int, int, int]
    born: float
    ttl: float = 0.7


@dataclass
class GameState:
    score: int = 0
    lives: int = 5
    running: bool = True
    game_over: bool = False
    fruits: list[Fruit] = field(default_factory=list)
    popups: list[ScorePopup] = field(default_factory=list)
    last_spawn: float = field(default_factory=time.time)
    spawn_interval: float = 0.85
    combo: int = 0
    last_slice_time: float = 0.0


def _spawn_fruit(width: int, height: int) -> Fruit:
    roll = random.random()
    if roll < 0.08:
        kind = FruitKind.BOMB
    elif roll < 0.45:
        kind = FruitKind.ORANGE
    elif roll < 0.75:
        kind = FruitKind.APPLE
    else:
        kind = FruitKind.WATERMELON

    meta = FRUIT_META[kind]
    x = random.uniform(meta["radius"] + 20, width - meta["radius"] - 20)
    y = height + meta["radius"]
    vx = random.uniform(-2.8, 2.8)
    vy = random.uniform(-16.5, -12.5)
    return Fruit(
        kind=kind,
        x=x,
        y=y,
        vx=vx,
        vy=vy,
        radius=meta["radius"],
    )


def _segment_hits_circle(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    cx: float,
    cy: float,
    radius: float,
    padding: float = 8.0,
) -> bool:
    """True if line segment (x1,y1)-(x2,y2) intersects circle."""
    r = radius + padding
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(cx - x1, cy - y1) <= r

    t = max(0.0, min(1.0, ((cx - x1) * dx + (cy - y1) * dy) / (dx * dx + dy * dy)))
    nearest_x = x1 + t * dx
    nearest_y = y1 + t * dy
    return math.hypot(cx - nearest_x, cy - nearest_y) <= r


def _trail_segments(
    trail: Sequence[tuple[int, int]],
) -> list[tuple[float, float, float, float]]:
    if len(trail) < 2:
        return []
    return [
        (float(trail[i - 1][0]), float(trail[i - 1][1]), float(trail[i][0]), float(trail[i][1]))
        for i in range(1, len(trail))
    ]


class FruitNinjaGame:
    GRAVITY = 0.38

    def __init__(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self.state = GameState()

    def reset(self) -> None:
        self.state = GameState()

    def update(self, trail: Sequence[tuple[int, int]], dt: float) -> None:
        st = self.state
        if st.game_over:
            return

        now = time.time()
        if now - st.last_spawn >= st.spawn_interval:
            st.fruits.append(_spawn_fruit(self.width, self.height))
            st.last_spawn = now
            st.spawn_interval = max(0.45, st.spawn_interval - 0.004)

        segments = _trail_segments(trail)
        for fruit in st.fruits:
            if fruit.sliced:
                continue
            for x1, y1, x2, y2 in segments:
                if _segment_hits_circle(x1, y1, x2, y2, fruit.x, fruit.y, fruit.radius):
                    self._slice_fruit(fruit, x2 - x1, y2 - y1, now)
                    break

        for fruit in list(st.fruits):
            if fruit.sliced:
                fruit.slice_time += dt
                fruit.x += (fruit.half_vx[0] + fruit.half_vx[1]) * 0.5 * dt * 60
                fruit.y += (fruit.half_vy[0] + fruit.half_vy[1]) * 0.5 * dt * 60
                fruit.half_vy = (fruit.half_vy[0] + 0.25, fruit.half_vy[1] + 0.25)
                if fruit.slice_time > 1.2:
                    st.fruits.remove(fruit)
                continue

            fruit.vy += self.GRAVITY
            fruit.x += fruit.vx
            fruit.y += fruit.vy

            if fruit.y - fruit.radius > self.height + 40 and not fruit.is_bomb:
                st.fruits.remove(fruit)
                st.lives -= 1
                st.combo = 0
                if st.lives <= 0:
                    st.game_over = True
            elif fruit.y + fruit.radius < -60 or fruit.x < -80 or fruit.x > self.width + 80:
                if fruit in st.fruits:
                    st.fruits.remove(fruit)

        st.popups = [p for p in st.popups if now - p.born < p.ttl]

    def _slice_fruit(self, fruit: Fruit, dx: float, dy: float, now: float) -> None:
        st = self.state
        fruit.sliced = True
        fruit.slice_time = 0.0
        angle = math.atan2(dy, dx) if (dx or dy) else 0.0
        fruit.slice_angle = angle
        spread = 4.5
        fruit.half_vx = (-math.sin(angle) * spread, math.sin(angle) * spread)
        fruit.half_vy = (-abs(math.cos(angle)) * 3, -abs(math.cos(angle)) * 3)

        if fruit.is_bomb:
            st.lives -= 1
            st.combo = 0
            st.popups.append(
                ScorePopup(
                    int(fruit.x),
                    int(fruit.y),
                    "BOOM!",
                    (0, 0, 255),
                    now,
                )
            )
            if st.lives <= 0:
                st.game_over = True
            return

        if now - st.last_slice_time < 0.35:
            st.combo += 1
        else:
            st.combo = 1
        st.last_slice_time = now
        bonus = min(st.combo - 1, 5)
        gained = fruit.points + bonus
        st.score += gained
        st.popups.append(
            ScorePopup(
                int(fruit.x),
                int(fruit.y - 20),
                f"+{gained}",
                (0, 255, 255),
                now,
            )
        )

    def draw(self, frame: np.ndarray, trail: Sequence[tuple[int, int]], fps: float) -> None:
        self._draw_trail(frame, trail)
        for fruit in self.state.fruits:
            self._draw_fruit(frame, fruit)
        self._draw_hud(frame, fps)
        now = time.time()
        for popup in self.state.popups:
            age = now - popup.born
            alpha = 1.0 - age / popup.ttl
            y_off = int(age * 40)
            cv2.putText(
                frame,
                popup.text,
                (popup.x - 20, popup.y - y_off),
                cv2.FONT_HERSHEY_DUPLEX,
                0.9,
                popup.color,
                2,
                cv2.LINE_AA,
            )

        if self.state.game_over:
            self._draw_center_text(frame, "GAME OVER", 1.4, (0, 0, 255))
            self._draw_center_text(frame, f"Final score: {self.state.score}", 0.8, (255, 255, 255), y_offset=50)
            self._draw_center_text(frame, "Press R to restart", 0.65, (200, 200, 200), y_offset=100)

    def _draw_trail(self, frame: np.ndarray, trail: Sequence[tuple[int, int]]) -> None:
        if len(trail) < 2:
            if trail:
                cv2.circle(frame, trail[-1], 10, (0, 255, 120), -1, cv2.LINE_AA)
            return

        overlay = frame.copy()
        n = len(trail)
        for i in range(1, n):
            t = i / n
            thickness = max(2, int(4 + t * 14))
            color = (0, int(180 + 75 * t), int(80 + 120 * t))
            cv2.line(overlay, trail[i - 1], trail[i], color, thickness, cv2.LINE_AA)
        cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)
        cv2.circle(frame, trail[-1], 8, (180, 255, 200), -1, cv2.LINE_AA)
        cv2.circle(frame, trail[-1], 4, (255, 255, 255), -1, cv2.LINE_AA)

    def _draw_fruit(self, frame: np.ndarray, fruit: Fruit) -> None:
        cx, cy = int(fruit.x), int(fruit.y)
        color = FRUIT_META[fruit.kind]["color"]

        if fruit.is_bomb and not fruit.sliced:
            cv2.circle(frame, (cx, cy), fruit.radius, color, -1, cv2.LINE_AA)
            cv2.circle(frame, (cx, cy), fruit.radius, (80, 80, 80), 3, cv2.LINE_AA)
            cv2.line(frame, (cx - 14, cy - 14), (cx + 14, cy + 14), (0, 0, 255), 3)
            cv2.line(frame, (cx + 14, cy - 14), (cx - 14, cy + 14), (0, 0, 255), 3)
            return

        if fruit.sliced:
            off = int(12 + fruit.slice_time * 28)
            cv2.circle(frame, (cx - off, cy + 4), max(8, fruit.radius - 6), color, -1, cv2.LINE_AA)
            cv2.circle(frame, (cx + off, cy + 4), max(8, fruit.radius - 6), color, -1, cv2.LINE_AA)
            cv2.ellipse(
                frame,
                (cx - off, cy + 4),
                (max(8, fruit.radius - 6), max(8, fruit.radius - 6)),
                0,
                90,
                270,
                (40, 40, 40),
                2,
                cv2.LINE_AA,
            )
            return

        cv2.circle(frame, (cx, cy), fruit.radius, color, -1, cv2.LINE_AA)
        highlight = tuple(min(255, c + 60) for c in color)
        cv2.circle(frame, (cx - fruit.radius // 4, cy - fruit.radius // 4), fruit.radius // 5, highlight, -1)
        cv2.circle(frame, (cx, cy), fruit.radius, (255, 255, 255), 2, cv2.LINE_AA)

    def _draw_hud(self, frame: np.ndarray, fps: float) -> None:
        st = self.state
        cv2.putText(
            frame,
            f"Score: {st.score}",
            (20, 40),
            cv2.FONT_HERSHEY_DUPLEX,
            1.0,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        if st.combo > 1:
            cv2.putText(
                frame,
                f"Combo x{st.combo}!",
                (20, 75),
                cv2.FONT_HERSHEY_DUPLEX,
                0.65,
                (0, 255, 255),
                2,
                cv2.LINE_AA,
            )

        heart_x = self.width - 30
        for i in range(st.lives):
            cv2.circle(frame, (heart_x - i * 35, 35), 12, (0, 0, 255), -1, cv2.LINE_AA)
            cv2.circle(frame, (heart_x - i * 35 - 8, 28), 8, (0, 0, 255), -1, cv2.LINE_AA)
            cv2.circle(frame, (heart_x - i * 35 + 8, 28), 8, (0, 0, 255), -1, cv2.LINE_AA)

        cv2.putText(
            frame,
            f"FPS: {fps:.0f}",
            (self.width - 110, self.height - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (180, 180, 180),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            "Move index finger to slice!  |  ESC: Quit  |  R: Restart",
            (self.width // 2 - 280, self.height - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (220, 220, 220),
            1,
            cv2.LINE_AA,
        )

    def _draw_center_text(
        self,
        frame: np.ndarray,
        text: str,
        scale: float,
        color: tuple[int, int, int],
        y_offset: int = 0,
    ) -> None:
        size = cv2.getTextSize(text, cv2.FONT_HERSHEY_DUPLEX, scale, 2)[0]
        x = (self.width - size[0]) // 2
        y = (self.height + size[1]) // 2 + y_offset
        cv2.putText(frame, text, (x, y), cv2.FONT_HERSHEY_DUPLEX, scale, color, 2, cv2.LINE_AA)
