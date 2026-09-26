# Pixel Hoops

A casual arcade basketball shooter built with [three.js](https://threejs.org). You get 60 seconds; drag up and let go to shoot, and sink as many as you can.

The 3D arena is rendered at about 240 lines, scaled up by a whole number with nearest-neighbour sampling so every art pixel is the same size, then inked with depth outlines and colour-quantised with a Bayer dither. The result reads like hand-drawn pixel art while the camera still moves freely through real 3D.

## Run it

```bash
cd hoops
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/, works from any folder
npm test         # physics and shot-mapping tests (node:test, no browser)
```

## How to play

- **Drag up and release** anywhere on the court to shoot. Drag length sets power; the angle of the drag bends the shot left or right. Dots show the first stretch of the arc while you aim.
- **2 points** inside the arc, **3** from beyond it. The tag above the hint tells you which, and how far out you are in feet.
- **+1** for a swish (nothing but net).
- **Three in a row** and you're on fire: every make scores double until you miss.
- Shooting spots drift further out as you score. After 12 makes the hoop starts sliding side to side, and after 18 it speeds up.
- A shot in the air when the buzzer goes still counts.
- **M** or the speaker button toggles sound. Your best score is kept in `localStorage`.

## How it's put together

| File | What it does |
|---|---|
| `src/main.js` | Game loop, state machine (title → countdown → play → results), input, camera |
| `src/physics.js` | Fixed-step ball physics: floor, backboard, pole, torus rim, net funnel, scoring |
| `src/shot.js` | Swipe → launch velocity, shooting spots, three-point line |
| `src/pixel.js` | Low-res render target + upscale shader (outlines, dither, palette) |
| `src/arena.js` | Court lighting, stands, instanced crowd, scoreboard, banners |
| `src/hoop.js` | Backboard, rim, stanchion and a spring-knot net that reacts to the ball |
| `src/textures.js` | Canvas-drawn pixel textures and a 3×5 bitmap font |
| `src/fx.js` | Confetti, fire sparks, aim dots |
| `src/audio.js` | Web Audio synth for every sound effect; no audio files |
| `src/hud.js` | DOM overlay: score, clock, streak, callouts, title and results screens |

Every throw is aimed so the ball would drop into the rim at a fixed entry angle (46°), so a perfect swipe is a swish from any spot. Difficulty comes from how far a real swipe strays from perfect. Tune the feel in `src/config.js`: `SHOT.powerSensitivity` and `SHOT.aimSensitivity` set how forgiving swipes are, `RIM.radius` sets the size of the target, and `GAME` holds the round length and when the hoop starts moving.
