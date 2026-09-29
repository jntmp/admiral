# Pixel Hoops

A casual arcade basketball shooter built with [three.js](https://threejs.org). You get 60 seconds; drag up and let go to shoot, and sink as many as you can.

**Play it:** https://jntmp.github.io/admiral/

The 3D arena is rendered at about 240 lines, scaled up by a whole number with nearest-neighbour sampling so every art pixel is the same size, then inked with depth outlines and colour-quantised with a Bayer dither. The result reads like hand-drawn pixel art while the camera still moves freely through real 3D.

## Run it

```bash
cd hoops
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/, works from any folder
npm test         # physics and shot-mapping tests (node:test, no browser)
```

Every push to `master` that touches `hoops/` is tested, built and deployed to GitHub Pages by `.github/workflows/hoops-pages.yml`. Pull requests get the tests and build without the deploy.

## How to play

- **Drag up and release** anywhere on the court to shoot. Drag length sets power; the angle of the drag bends the shot left or right.
- While you aim, the **power gauge** on the left fills with the drag, and dots trace the ball's whole flight. An amber ring marks where it will first meet something: dropping through rim height, the glass or the floor. The preview uses the same physics as the throw, so it is exact until the ball touches the rim, the glass or the net.
- **2 points** inside the arc, **3** from beyond it. The tag above the hint tells you which, and how far out you are in feet.
- **+1** for a swish (nothing but net).
- **Three in a row** and you're on fire: every make scores double until you miss.
- Shooting spots drift further out as you score. After 12 makes the hoop starts sliding side to side, and after 18 it speeds up.
- A shot in the air when the buzzer goes still counts.
- **M** or the speaker button toggles sound. Your best score is kept in `localStorage`.
- After a round, enter three initials (letters only, arcade style) to post your score to the **online leaderboard**, then see where you rank this week and all time. The leaderboard is also on the title screen.
- Each set of initials is on a board once, at its best. A score only goes up if it beats your best on that board: for classic rounds, your best from the last 7 days (so you can still make the weekly board after a quieter week), and for a daily, your score on that day's challenge.
- **Share** your round as a Wordle-style card: one square per shot (🟨 swish, 🟧 make, ⬜ went in but didn't count, ⬛ miss), your score, your rank and a link. Phones get the share sheet; elsewhere it's copied to the clipboard.

### Daily challenge

Everyone plays the same round each day: the date (UTC) picks the twist and seeds the shooting spots, so every player's nth shot is from the same place. Your first daily round of the day is the official one and goes on the daily leaderboard; later rounds that day are practice. **Menu** on the results screen goes back to the title screen, where the daily card shows your official result and a countdown to the next daily.

| Day | Twist |
|---|---|
| Monday | **Swish only**: touch the rim or glass and it doesn't count |
| Tuesday | **Glass only**: only bank shots score |
| Wednesday | **Downtown**: every shot is a three |
| Thursday | **Blind**: no aim line, just the power gauge |
| Friday | **Free throws**: every shot from the line |
| Saturday | **Moving hoop**: it slides from the first shot |
| Sunday | **Sudden death**: your first miss ends the round |

## How it's put together

| File | What it does |
|---|---|
| `src/main.js` | Game loop, state machine (title → countdown → play → results), input, camera |
| `src/physics.js` | Fixed-step ball physics: floor, backboard, pole, torus rim, net funnel, scoring |
| `src/shot.js` | Swipe → launch velocity, aim preview path, shooting spots, three-point line |
| `src/pixel.js` | Low-res render target + upscale shader (outlines, dither, palette) |
| `src/arena.js` | Court lighting, stands, instanced crowd, scoreboard, banners |
| `src/hoop.js` | Backboard, rim, stanchion and a spring-knot net that reacts to the ball |
| `src/textures.js` | Canvas-drawn pixel textures and a 3×5 bitmap font |
| `src/fx.js` | Confetti, fire sparks, aim dots |
| `src/audio.js` | Web Audio synth for every sound effect (no audio files), through a low-pass, a short room reverb and a compressor |
| `src/hud.js` | DOM overlay: score, clock, streak, power gauge, callouts, title and results screens |
| `src/leaderboard.js` | Supabase REST client for reading top scores and submitting a round |
| `src/board.js` | Initials form on the results screen and the leaderboard screen |
| `src/daily.js` | Daily challenge: the day's twist, seeded shooting spots, scoring rules, share text |
| `src/share.js` | Share card: squares on the results screen, share sheet or clipboard |
| `supabase/migrations/` | The leaderboard's table and access rules, and the `submit_score`, `submit_daily` and `top_scores` functions |

Every throw is aimed so the ball would drop into the rim at a fixed entry angle (46°), so a perfect swipe is a swish from any spot. Difficulty comes from how far a real swipe strays from perfect. Tune the feel in `src/config.js`: `SHOT.powerSensitivity` and `SHOT.aimSensitivity` set how forgiving swipes are, `RIM.radius` sets the size of the target, and `GAME` holds the round length and when the hoop starts moving.

## Leaderboard

Scores live in the Supabase project set in `LEADERBOARD` in `src/config.js`; clear its `url` or `key` to switch the leaderboard off. The game talks to Supabase's REST API with plain `fetch`, so there is no SDK in the bundle.

The game runs in the browser, so a determined player can always send a fake score. The database keeps that bounded:

- Anyone can read `scores`, but nobody can insert, edit or delete rows directly. Every write goes through `submit_score()` or `submit_daily()`.
- Only a player's new best is stored. Initials are the only identity the game has, so they stand for the player: a round that doesn't beat that player's best on its board (last 7 days for classic rounds, the same day for a daily) is turned down with a 409 and a message saying what the best is. The game reads boards through `top_scores()`, which lists each player once at their best.
- Check constraints reject anything a real round can't produce: initials must be exactly three capital letters, as on an arcade high-score table; there are at most 60 attempts, no more makes than attempts, and at most 8 points per make (a swished three, doubled on fire).
- Each client can submit 5 scores a minute. Clients are tracked by a salted hash of their IP address, kept for an hour at most, in a schema the API doesn't expose.
- Every round carries a random id. If a save never gets an answer (a dropped mobile connection, say), the game retries it up to twice, and the server returns the stored result for a round it already has instead of adding a second row.
- Daily rounds go through `submit_daily()`, which only accepts today's challenge (UTC), with ten minutes' grace after midnight for a round that started the day before. They're ranked separately from classic rounds. "One official round a day" is kept in the browser, so it's an honour system.

To run it against your own Supabase project, apply `supabase/migrations/*.sql` (with the Supabase CLI or the SQL editor), then put that project's URL and publishable key in `src/config.js`. On Supabase's free plan a project pauses after a week without traffic; the game shows the leaderboard as unreachable until you restore it from the dashboard.
