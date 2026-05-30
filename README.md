# Hand Slice — Fruit Ninja with Computer Vision

A standalone game inspired by [Fruit Ninja](https://en.wikipedia.org/wiki/Fruit_Ninja) and hand-tracking demos like [this LinkedIn build](https://www.linkedin.com/posts/-viditsharma_python-gamedevelopment-computervision-ugcPost-7465296231221669888-NVxb/). Use your **index finger** and **camera** to slice flying fruit.

This project is **separate** from the Telegram Mini App (`webapp/`) and backend.

## Two versions

| Folder | Platform | Use case |
|--------|----------|----------|
| **`web/`** | Browser (mobile + desktop) | Deploy to **Vercel**, test on phone Chrome / Telegram |
| **Root (`main.py`)** | Python desktop | Local webcam on PC/Mac |

---

## Web / mobile (Vercel)

Mobile-first browser game using **MediaPipe in the browser** + front camera.

### Local dev

```bash
cd fruit-ninja-cv/web
npm install
npm run dev
```

Open the URL on your phone (same Wi‑Fi) or use `npm run dev -- --host` and visit `http://YOUR_PC_IP:5175`.

**Camera requires HTTPS** on real phones — use Vercel preview/production, or a tunnel (ngrok).

### Deploy to Vercel

1. Push this repo (or only `fruit-ninja-cv/web` as its own repo).
2. [Vercel](https://vercel.com) → **New Project** → import repo.
3. Set **Root Directory** to `fruit-ninja-cv/web` (if monorepo).
4. **Build command:** `npm run build`
5. **Output directory:** `dist`
6. Deploy.

### Test on mobile

- **Chrome (Android / iOS):** open your Vercel URL → **Tap to start camera** → allow camera.
- **Telegram:** send yourself the link or open in Mini App browser — camera works on **HTTPS**; some in-app browsers are stricter (prefer “Open in Chrome/Safari” if camera is blocked).

### Mobile tips

- Front camera, good lighting, plain background
- Hold phone in **portrait**, extend **index finger**
- If tracking is slow, close other tabs; first load downloads the ML model (~3 MB)

---

## Desktop (Python)

### Features

- Real-time **MediaPipe** hand tracking (index fingertip)
- Glowing **slice trail** following your finger
- Oranges, apples, watermelons (+ points) and **bombs** (lose a life)
- Score, combo multiplier, lives

### Requirements

- Python **3.9 – 3.13** (3.10–3.12 most reliable)
- Webcam — Windows / macOS / Linux

### Setup

```bash
cd fruit-ninja-cv
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

On first run, the hand-tracking model (~3 MB) downloads automatically into `models/`.

### Run

```bash
python main.py
```

### Controls

| Key | Action |
|-----|--------|
| **Index finger** | Slice fruit (move quickly through targets) |
| **ESC** | Quit |
| **R** | Restart after game over |

---

## Project layout

```
fruit-ninja-cv/
  web/              # Mobile/browser — deploy to Vercel
    src/
    vercel.json
  main.py           # Desktop game loop
  hand_tracker.py
  game.py
  requirements.txt
  README.md
```

## Stack

**Web:** Vite, TypeScript, [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision)

**Desktop:** OpenCV, MediaPipe Python, NumPy

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Camera blocked on mobile | Must be **HTTPS** (Vercel). Allow camera in browser settings. |
| Telegram won’t open camera | Open link in **Chrome/Safari** instead of in-app browser |
| `Could not open webcam` (desktop) | Allow camera in OS settings |
| No hand detected | Improve lighting; move hand closer |
| MediaPipe install fails (desktop) | Use Python 3.10–3.12 |

## License

MIT — use freely for portfolio demos and learning.
