# The Warden's Labyrinth → **NEUROSPIRE: Aegis Protocol**

A proposed game name + logo concept (cyber sigil: a fractured hexagonal eye with a vertical sword-axis through it, neon-cyan + magenta). If you'd prefer a different name I'll swap it before building.

This plan is grouped by system. I'll implement top→bottom in one batch unless you want to drop any section.

---

## 1. Main Menu + Branding Layer
- New `MainMenu` overlay shown on load with cinematic boot sequence (scanlines wipe → logo assemble → tabs fade-in staggered, ~1.2s).
- Tabs:
  1. **Start the Purge** → difficulty select → game start
  2. **Controls** → keybinds reference + mobile sensitivity slider + customizable shoot-button position
  3. **Personal Record** → best time per level + per difficulty (in-memory only, no persistence per your earlier choice — I'll add a note that records reset on reload)
  4. **Exit** → returns to a "Stand-by" idle screen
- Animated logo (SVG, procedurally pulsing) + game title with glitch-flicker.
- Same overlay reused for **Pause menu** (Resume / Controls / Quit to Menu).

## 2. Pause System (SAO-style)
- New pause button below the HP HUD with hex-ring sweep animation on hover/press.
- Pause overlay = radial menu with 4 hex-tiles that orbit-in (SAO menu vibe), freezes engine `dt` to 0.

## 3. HUD / UI Polish
- Animated HP bar: segmented blocks animate-in on level start, damage flash, low-HP heartbeat pulse + red vignette.
- Timer: digit roll animation, color shifts (cyan → amber <60s → red <20s with pulse).
- Med-Core icon: floating animation, pickup ring sweep.
- Warden trace log: typewriter feed-in per line.
- All transitions use cubic easing — no more instant pops.

## 4. Enemy Overhaul
**Speeds (relative to player baseline ~180):**
- Slasher: 220 (faster than player) — bursts to 320 on dash
- Shooter: 195 (slightly faster)
- Shield: 165 (faster than before, was slow tank)
- Sniper: 110 (slow)

**Cap:** Sniper hard-capped at **4 alive at any moment, any level**.

**Per-difficulty scaling** (multiplies attack-speed, move-speed, detection-range):
| Difficulty | atk×  | move× | detect× |
|------------|------|------|--------|
| Easy       | 0.8  | 0.9  | 0.85   |
| Medium     | 1.0  | 1.0  | 1.0    |
| Hard       | 1.25 | 1.1  | 1.15   |
| Nightmare  | 1.55 | 1.25 | 1.35   |

**Detection ranges (base, in pixels):**
- Sniper: 900 (highest) — can see through up to **2 walls**
- Shooter: 520
- Shield: 380
- Slasher: 300 (lowest — fastest = shortest sight)
- All others: **blocked by any wall** (raycast LOS check).
- Once aggro'd, enemies keep target for 3s after losing LOS (memory).

**Group spawning** — enemies spawn as squads, not scattered solo. Group composition:
- Slasher 30–45%, Shooter 20–35%, Shield 15–25%, Sniper 10–20%
- Group size = `base(level) × difficultyMul`, e.g. L1 Easy = 6 per group, L4 Nightmare ≈ 14
- Groups spawn in distinct rooms; rolled per encounter.

## 5. Enemy Skins / Animations (procedural sprites, bigger)
- **Slasher**: lean dual-blade reaper, blade-trail afterimages, lunge anim.
- **Shooter**: armored sentinel with shoulder-mounted twin barrels, recoil kick.
- **Sniper**: tall lanky frame, long rail-rifle, red laser dot, charge glow before shot.
- **Shield**: hulking bulwark with rotating hex-shield, slam-walk anim.
- All get: idle bob, walk cycle, hit-flash, death-shatter (geometric break-apart).

## 6. Levels — Bigger, Rooms, Halls, Traps, Parkour
- World sizes increased 1.3–1.5× (e.g. L1 → 2800×1900, L4 → 4200×2800).
- **Thicker walls** (32→56 px) with double-line neon trim.
- **Room generator**: levels composed of 4–8 rooms connected by hallways with doorways.
- **Traps in all levels**: laser fences, pressure-plate spike floors, electrified tiles.
- **Parkour in L2 & L3**: phase-platforms over voids, conveyor-jumps, timed gates.
- **Light puzzles**: kill-all-in-room → unlock door; activate 2 pylons → bridge appears.
- Time limits **−60s each**: L1=120s, L2=150s, L3=180s, L4=210s.

## 7. Audio System
- New `src/lib/audio.ts` using WebAudio (synthesized SFX — no asset downloads needed, keeps bundle small and works offline).
- SFX: player shoot, dash, hit, heal, footstep, sword-swing, death; enemy shoot, slash, shield-up, sniper-charge, death-shatter; trap-trigger, gate-open, countdown-beep, victory-jingle, time-out-alarm, game-over-drone.
- **Boss BGM**: procedurally generated dark synth loop (saw-bass + arpeggio), starts on L4 countdown, ducks during ability warnings.
- Master volume + SFX/Music sliders in Controls tab.

## 8. Mobile Controls
- Auto-detect touch via existing `useIsMobile`.
- Left thumb: virtual joystick (already exists — polish hit area).
- Right thumb: **Dash** + **Shoot** buttons (Shoot is new, customizable position).
- Controls tab → drag-to-reposition Shoot button + **sensitivity slider** (joystick deadzone & max speed scaling).
- Pause button stays top-left under HP.
- Layout responsive: HUD scales, menu tabs become bottom-sheet on mobile.

---

## Technical breakdown (for reference)

**Files to edit/create:**
- `src/game/types.ts` — add `DetectionConfig`, `GroupSpawn`, room/trap types, update enemy stats
- `src/game/engine.ts` — LOS raycast, group spawner, room generator, trap logic, detection/memory, time limits
- `src/game/render.ts` — new enemy sprites + animations, thicker walls, room/trap rendering, HUD animations
- `src/game/audio.ts` (new) — WebAudio SFX + boss BGM synth
- `src/components/WardenGame.tsx` — MainMenu, PauseMenu, Controls tab, Personal Record, mobile shoot button, HUD polish
- `src/components/MainMenu.tsx` (new) — animated menu + logo
- `src/components/GameLogo.tsx` (new) — SVG animated logo
- `src/styles.css` — keyframes for menu/HUD animations

**Scope flags I want to confirm:**
- "Personal Record" — keep **in-memory only** (resets on reload) per your earlier "no persistence" choice? Or should I enable Lovable Cloud for real persistence?
- Game name: **NEUROSPIRE: Aegis Protocol** — OK or want me to pick a different one?
- Audio: synth-generated (instant, offline, no assets) — OK, or do you want me to source real SFX/music (longer, larger bundle)?

If those three are fine, I'll proceed with the plan exactly as above.
