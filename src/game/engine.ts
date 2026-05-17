import type { Bullet, Enemy, Hazard, Particle, Player, Vec, Wall, AnimState } from "./types";
import type { LevelConfig, PlayerMetrics } from "@/lib/warden.functions";

export const VIEW_W = 900;
export const VIEW_H = 600;
// kept for backward-compat imports
export const ARENA_W = VIEW_W;
export const ARENA_H = VIEW_H;

const PLAYER_RADIUS = 16;
const PLAYER_MAX_SPEED = 280;
const PLAYER_ACCEL = 14;
const PLAYER_FRICTION = 10;
const DASH_SPEED = 720;
const DASH_DURATION = 0.16;
const DASH_CD = 0.55;
const DASH_IFRAMES = 0.22;
const SHOOT_CD = 0.22;
const BULLET_SPEED = 620;
const INPUT_BUFFER_TIME = 0.12;

type Action = "dash" | "shoot";

export type EngineState = "countdown" | "playing" | "victory" | "dead";

export type GameEvent =
  | { type: "trace"; msg: string }
  | { type: "metrics"; metrics: PlayerMetrics }
  | { type: "level_cleared"; metrics: PlayerMetrics }
  | { type: "death" }
  | { type: "warden_taunt"; msg: string };

const WORLD_SIZES: Record<number, { w: number; h: number }> = {
  1: { w: 1600, h: 1100 },
  2: { w: 2000, h: 1300 },
  3: { w: 2200, h: 1500 },
  4: { w: 1700, h: 1200 },
};

export class GameEngine {
  player!: Player;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  hazards: Hazard[] = [];
  particles: Particle[] = [];
  walls: Wall[] = [];
  level = 1;
  worldW = 1600;
  worldH = 1100;
  cam: Vec = { x: 0, y: 0 };
  state: EngineState = "countdown";
  countdown = 3; // seconds remaining
  victoryHold = 0;
  config: LevelConfig | null = null;
  elapsed = 0;
  shake = 0;
  dead = false;
  cleared = false;

  m = {
    damageDealt: 0,
    damageTaken: 0,
    dashCount: 0,
    shotsFired: 0,
    shotsHit: 0,
    killsByDash: 0,
    killsByShot: 0,
  };
  private lastDashKilled = false;

  keys = new Set<string>();
  pointer: Vec = { x: VIEW_W / 2, y: VIEW_H / 2 }; // SCREEN coords
  pointerDown = false;
  private buffer: { action: Action; t: number }[] = [];
  virtualMove: Vec = { x: 0, y: 0 };

  onEvent: (e: GameEvent) => void = () => {};
  private nextId = 1;

  constructor() {
    this.resetPlayer();
  }

  resetPlayer() {
    this.player = {
      pos: { x: 200, y: this.worldH / 2 },
      vel: { x: 0, y: 0 },
      hp: 100,
      maxHp: 100,
      facing: { x: 1, y: 0 },
      dashCd: 0,
      dashTime: 0,
      iFrames: 0,
      shootCd: 0,
      scaleX: 1,
      scaleY: 1,
      stunned: 0,
      animTime: 0,
      anim: "idle",
      attackSwing: 0,
    };
  }

  loadLevel(cfg: LevelConfig) {
    this.config = cfg;
    this.level = cfg.nextLevel;
    const ws = WORLD_SIZES[this.level] ?? WORLD_SIZES[1];
    this.worldW = ws.w;
    this.worldH = ws.h;
    this.elapsed = 0;
    this.cleared = false;
    this.dead = false;
    this.enemies = [];
    this.bullets = [];
    this.hazards = [];
    this.particles = [];
    this.walls = [];
    this.m = { damageDealt: 0, damageTaken: 0, dashCount: 0, shotsFired: 0, shotsHit: 0, killsByDash: 0, killsByShot: 0 };
    this.resetPlayer();
    this.buildWalls();
    this.spawnEnemies(cfg);
    this.spawnHazards(cfg);
    this.state = "countdown";
    this.countdown = 3;
    this.victoryHold = 0;
    this.updateCamera();
    this.onEvent({ type: "warden_taunt", msg: cfg.taunt });
    cfg.reasoning.forEach((r) => this.onEvent({ type: "trace", msg: r }));
  }

  private buildWalls() {
    const t = 28; // wall thickness
    // outer border
    this.walls.push({ x: 0, y: 0, w: this.worldW, h: t, kind: "wall" });
    this.walls.push({ x: 0, y: this.worldH - t, w: this.worldW, h: t, kind: "wall" });
    this.walls.push({ x: 0, y: 0, w: t, h: this.worldH, kind: "wall" });
    this.walls.push({ x: this.worldW - t, y: 0, w: t, h: this.worldH, kind: "wall" });

    // interior layout per level
    const cx = this.worldW / 2;
    const cy = this.worldH / 2;
    if (this.level === 1) {
      // simple chamber with a vestibule wall + open gate
      this.walls.push({ x: 380, y: 200, w: t, h: this.worldH - 400, kind: "wall" });
      this.walls.push({ x: 380, y: cy + 80, w: t, h: 200, kind: "gate", locked: false });
    } else if (this.level === 2) {
      // pillars grid
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          this.walls.push({ x: 320 + i * 380, y: 220 + j * 320, w: 80, h: 80, kind: "wall" });
        }
      }
      // dividing wall with gate
      this.walls.push({ x: cx - t / 2, y: 0, w: t, h: cy - 120, kind: "wall" });
      this.walls.push({ x: cx - t / 2, y: cy + 120, w: t, h: this.worldH - (cy + 120), kind: "wall" });
    } else if (this.level === 3) {
      // labyrinth-ish corridors
      this.walls.push({ x: 300, y: 200, w: t, h: 700, kind: "wall" });
      this.walls.push({ x: 700, y: 100, w: t, h: 500, kind: "wall" });
      this.walls.push({ x: 700, y: 700, w: t, h: 600, kind: "wall" });
      this.walls.push({ x: 1100, y: 300, w: t, h: 900, kind: "wall" });
      this.walls.push({ x: 1500, y: 200, w: t, h: 700, kind: "wall" });
      this.walls.push({ x: 1500, y: 1000, w: t, h: 350, kind: "wall" });
      // horizontal segment with gate
      this.walls.push({ x: 1700, y: cy - t / 2, w: 300, h: t, kind: "gate", locked: false });
    } else if (this.level === 4) {
      // boss colosseum: ring of pillars
      const ringR = 480;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        this.walls.push({
          x: cx + Math.cos(a) * ringR - 30,
          y: cy + Math.sin(a) * ringR - 30,
          w: 60,
          h: 60,
          kind: "wall",
        });
      }
    }
  }

  private spawnEnemies(cfg: LevelConfig) {
    const cx = this.worldW / 2;
    const cy = this.worldH / 2;
    if (this.level === 4) {
      this.enemies.push({
        id: this.nextId++,
        pos: { x: cx, y: cy - 180 },
        vel: { x: 0, y: 0 },
        hp: 80,
        maxHp: 80,
        speed: cfg.enemySpeed * 0.6,
        radius: 40,
        shielded: false,
        isBoss: true,
        telegraph: 2.5,
        attackKind: cfg.bossPhase === "sweep" ? "sweep" : "predict",
        hitFlash: 0,
        animTime: 0,
        facing: { x: 0, y: 1 },
        anim: "idle",
        attackTimer: 0,
      });
      const adds = Math.min(3, cfg.enemyCount);
      for (let i = 0; i < adds; i++) {
        const a = (i / adds) * Math.PI * 2;
        this.enemies.push(this.makeDrone({
          x: cx + Math.cos(a) * 260,
          y: cy + Math.sin(a) * 160,
        }, cfg, false));
      }
      return;
    }
    for (let i = 0; i < cfg.enemyCount; i++) {
      let pos: Vec;
      switch (cfg.spawnPattern) {
        case "ring": {
          const a = (i / cfg.enemyCount) * Math.PI * 2;
          pos = { x: cx + Math.cos(a) * 340, y: cy + Math.sin(a) * 240 };
          break;
        }
        case "corridor": {
          pos = { x: 500 + (i * (this.worldW - 800)) / cfg.enemyCount, y: 200 + (i % 3) * (this.worldH - 400) / 2 };
          break;
        }
        case "ambush": {
          pos = { x: i < cfg.enemyCount / 2 ? this.worldW - 200 : cx, y: 200 + Math.random() * (this.worldH - 400) };
          break;
        }
        case "swarm": {
          pos = { x: cx + (Math.random() - 0.5) * 200, y: cy + (Math.random() - 0.5) * 200 };
          break;
        }
        default:
          pos = { x: 500 + Math.random() * (this.worldW - 700), y: 200 + Math.random() * (this.worldH - 400) };
      }
      // ensure not inside a wall
      pos = this.nudgeOutOfWalls(pos, 14);
      const shielded = cfg.hazards.includes("shield_drone") && i % 3 === 0;
      this.enemies.push(this.makeDrone(pos, cfg, shielded));
    }
  }

  private makeDrone(pos: Vec, cfg: LevelConfig, shielded: boolean): Enemy {
    return {
      id: this.nextId++,
      pos,
      vel: { x: 0, y: 0 },
      hp: cfg.enemyHp,
      maxHp: cfg.enemyHp,
      speed: cfg.enemySpeed,
      radius: 14,
      shielded,
      hitFlash: 0,
      animTime: Math.random() * 2,
      facing: { x: 1, y: 0 },
      anim: "idle",
      attackTimer: 0,
    };
  }

  private nudgeOutOfWalls(p: Vec, r: number): Vec {
    let out = { ...p };
    for (let i = 0; i < 4; i++) {
      let hit = false;
      for (const w of this.walls) {
        if (
          out.x + r > w.x && out.x - r < w.x + w.w &&
          out.y + r > w.y && out.y - r < w.y + w.h
        ) {
          hit = true;
          out.x += 60; // shove right
          break;
        }
      }
      if (!hit) break;
    }
    return out;
  }

  private spawnHazards(cfg: LevelConfig) {
    const cy = this.worldH / 2;
    for (const h of cfg.hazards) {
      if (h === "laser") {
        for (let i = 0; i < 3; i++) {
          this.hazards.push({
            kind: "laser",
            x: 500 + i * 360,
            y: 180,
            w: 14,
            h: this.worldH - 360,
            phase: i * 0.6,
            period: 2.2,
          });
        }
      } else if (h === "conveyor") {
        this.hazards.push({ kind: "conveyor", x: 300, y: cy - 50, w: this.worldW - 600, h: 100, vx: 120, vy: 0 });
      } else if (h === "phase") {
        for (let i = 0; i < 4; i++) {
          this.hazards.push({
            kind: "phase",
            x: 500 + i * 280,
            y: 260 + (i % 2) * 280,
            w: 90,
            h: 90,
            phase: i * 0.4,
            period: 2.6,
          });
        }
      } else if (h === "stun_pylon") {
        for (let i = 0; i < 3; i++) {
          this.hazards.push({
            kind: "stun_pylon",
            x: 420 + i * 380,
            y: 220 + (i % 2) * (this.worldH - 440),
            r: 90,
            cooldown: 0,
            charge: 1 + i * 0.5,
          });
        }
      } else if (h === "anti_dash") {
        for (let i = 0; i < 4; i++) {
          this.hazards.push({
            kind: "anti_dash",
            x: 400 + (i % 2) * (this.worldW - 800),
            y: 250 + Math.floor(i / 2) * (this.worldH - 500),
            r: 70,
          });
        }
      }
    }
  }

  pressAction(a: Action) {
    this.buffer.push({ action: a, t: this.elapsed });
  }

  private consumeBuffer(a: Action): boolean {
    const idx = this.buffer.findIndex(
      (b) => b.action === a && this.elapsed - b.t < INPUT_BUFFER_TIME,
    );
    if (idx >= 0) { this.buffer.splice(idx, 1); return true; }
    return false;
  }

  private input(): Vec {
    let x = 0, y = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    const len = Math.hypot(x, y);
    if (len > 0) return { x: x / len, y: y / len };
    return { x: 0, y: 0 };
  }

  // convert screen pointer -> world coords using current camera
  pointerWorld(): Vec {
    return { x: this.pointer.x + this.cam.x, y: this.pointer.y + this.cam.y };
  }

  update(dt: number) {
    if (this.state === "countdown") {
      this.countdown -= dt;
      // still update visuals lightly so trail/anim breathe
      this.player.animTime += dt;
      for (const e of this.enemies) e.animTime += dt;
      this.updateCamera();
      if (this.countdown <= 0) {
        this.state = "playing";
        this.countdown = 0;
        this.elapsed = 0;
      }
      return;
    }
    if (this.state === "victory") {
      this.victoryHold -= dt;
      this.player.animTime += dt;
      this.player.anim = "victory";
      this.updateParticles(dt);
      this.updateCamera();
      if (this.victoryHold <= 0) {
        const metrics = this.snapshotMetrics(true);
        this.state = "countdown"; // freeze until next loadLevel
        this.onEvent({ type: "level_cleared", metrics });
      }
      return;
    }
    if (this.state === "dead") {
      this.updateParticles(dt);
      this.updateCamera();
      return;
    }

    this.elapsed += dt;
    this.buffer = this.buffer.filter((b) => this.elapsed - b.t < INPUT_BUFFER_TIME);

    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateHazards(dt);
    this.updateParticles(dt);
    this.checkCollisions();
    this.updateCamera();

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);

    if (this.player.hp <= 0 && this.state !== "dead") {
      this.state = "dead";
      this.shake = 14;
      this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#ff3b6b", 50);
      this.onEvent({ type: "death" });
    }
    if (this.enemies.length === 0 && this.state === "playing") {
      this.state = "victory";
      this.victoryHold = 2.2;
      this.player.attackSwing = 0;
      // celebratory burst
      this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#00f0ff", 30);
    }
  }

  private updateCamera() {
    const targetX = this.player.pos.x - VIEW_W / 2;
    const targetY = this.player.pos.y - VIEW_H / 2;
    // smooth follow
    this.cam.x += (targetX - this.cam.x) * 0.15;
    this.cam.y += (targetY - this.cam.y) * 0.15;
    this.cam.x = Math.max(0, Math.min(this.worldW - VIEW_W, this.cam.x));
    this.cam.y = Math.max(0, Math.min(this.worldH - VIEW_H, this.cam.y));
  }

  snapshotMetrics(cleared: boolean): PlayerMetrics {
    const acc = this.m.shotsFired > 0 ? this.m.shotsHit / this.m.shotsFired : 0;
    return {
      level: this.level,
      timeMs: this.elapsed * 1000,
      damageDealt: this.m.damageDealt,
      damageTaken: this.m.damageTaken,
      dashCount: this.m.dashCount,
      shotsFired: this.m.shotsFired,
      hitAccuracy: Math.min(1, acc),
      killsByDash: this.m.killsByDash,
      killsByShot: this.m.killsByShot,
      hpRemaining: Math.max(0, this.player.hp),
      cleared,
    };
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.iFrames = Math.max(0, p.iFrames - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);
    p.stunned = Math.max(0, p.stunned - dt);
    p.animTime += dt;
    p.attackSwing = Math.max(0, p.attackSwing - dt * 4);

    p.scaleX += (1 - p.scaleX) * Math.min(1, dt * 8);
    p.scaleY += (1 - p.scaleY) * Math.min(1, dt * 8);

    const move = this.input();
    const total = { x: move.x + this.virtualMove.x, y: move.y + this.virtualMove.y };
    const tlen = Math.hypot(total.x, total.y);
    const dir = tlen > 1 ? { x: total.x / tlen, y: total.y / tlen } : total;

    if (p.dashTime > 0) {
      // dash keeps velocity
    } else if (p.stunned > 0) {
      p.vel.x = lerp(p.vel.x, 0, dt * PLAYER_FRICTION);
      p.vel.y = lerp(p.vel.y, 0, dt * PLAYER_FRICTION);
    } else if (dir.x !== 0 || dir.y !== 0) {
      p.vel.x = lerp(p.vel.x, dir.x * PLAYER_MAX_SPEED, dt * PLAYER_ACCEL);
      p.vel.y = lerp(p.vel.y, dir.y * PLAYER_MAX_SPEED, dt * PLAYER_ACCEL);
      p.facing = dir;
      p.scaleX = 1 + Math.abs(dir.x) * 0.18;
      p.scaleY = 1 + Math.abs(dir.y) * 0.18;
    } else {
      p.vel.x = lerp(p.vel.x, 0, dt * PLAYER_FRICTION);
      p.vel.y = lerp(p.vel.y, 0, dt * PLAYER_FRICTION);
    }

    // animation state
    if (p.iFrames > 0.25 && p.dashTime === 0) p.anim = "hit";
    else if (p.dashTime > 0) p.anim = "dash";
    else if (Math.hypot(p.vel.x, p.vel.y) > 40) p.anim = "run";
    else p.anim = "idle";

    // buffered dash
    if (p.dashCd === 0 && p.stunned === 0 && this.consumeBuffer("dash")) {
      const d = dir.x === 0 && dir.y === 0 ? p.facing : dir;
      const dlen = Math.hypot(d.x, d.y) || 1;
      p.vel.x = (d.x / dlen) * DASH_SPEED;
      p.vel.y = (d.y / dlen) * DASH_SPEED;
      p.dashTime = DASH_DURATION;
      p.dashCd = DASH_CD;
      p.iFrames = DASH_IFRAMES;
      p.scaleX = 1.5; p.scaleY = 0.6;
      this.m.dashCount++;
      this.lastDashKilled = false;
      for (let i = 0; i < 10; i++) {
        this.particles.push({
          pos: { x: p.pos.x, y: p.pos.y },
          vel: { x: -p.vel.x * 0.2 + (Math.random() - 0.5) * 40, y: -p.vel.y * 0.2 + (Math.random() - 0.5) * 40 },
          life: 0.4, maxLife: 0.4, color: "#9d4dff", size: 4 + Math.random() * 3,
        });
      }
    }

    // buffered shoot
    if (p.shootCd === 0 && p.stunned === 0 && this.consumeBuffer("shoot")) {
      const aim = this.aimDir();
      this.bullets.push({
        pos: { x: p.pos.x + aim.x * 18, y: p.pos.y + aim.y * 18 },
        vel: { x: aim.x * BULLET_SPEED, y: aim.y * BULLET_SPEED },
        life: 3.5,
        fromPlayer: true,
      });
      p.shootCd = SHOOT_CD;
      p.facing = aim;
      p.attackSwing = 1;
      this.m.shotsFired++;
      p.scaleX = 1.3; p.scaleY = 0.85;
    }

    if (this.pointerDown && p.shootCd === 0 && p.stunned === 0) {
      this.pressAction("shoot");
    }

    // apply velocity with wall collision
    this.moveWithWalls(p.pos, p.vel, PLAYER_RADIUS, dt);
    // clamp to world
    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(this.worldW - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(this.worldH - PLAYER_RADIUS, p.pos.y));
  }

  private moveWithWalls(pos: Vec, vel: Vec, r: number, dt: number) {
    // resolve X
    pos.x += vel.x * dt;
    for (const w of this.walls) {
      if (pos.x + r > w.x && pos.x - r < w.x + w.w && pos.y + r > w.y && pos.y - r < w.y + w.h) {
        if (vel.x > 0) pos.x = w.x - r;
        else if (vel.x < 0) pos.x = w.x + w.w + r;
        vel.x = 0;
      }
    }
    // resolve Y
    pos.y += vel.y * dt;
    for (const w of this.walls) {
      if (pos.x + r > w.x && pos.x - r < w.x + w.w && pos.y + r > w.y && pos.y - r < w.y + w.h) {
        if (vel.y > 0) pos.y = w.y - r;
        else if (vel.y < 0) pos.y = w.y + w.h + r;
        vel.y = 0;
      }
    }
  }

  private aimDir(): Vec {
    const world = this.pointerWorld();
    const dx = world.x - this.player.pos.x;
    const dy = world.y - this.player.pos.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return this.player.facing;
    return { x: dx / len, y: dy / len };
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.animTime += dt;
      e.attackTimer = Math.max(0, e.attackTimer - dt);
      if (e.isBoss) {
        e.telegraph = (e.telegraph ?? 0) - dt;
        // circle the player at distance
        const dx = this.player.pos.x - e.pos.x;
        const dy = this.player.pos.y - e.pos.y;
        const dist = Math.hypot(dx, dy) || 1;
        const desired = 280;
        const radial = (dist - desired) * 1.6;
        const perpX = -dy / dist;
        const perpY = dx / dist;
        e.vel.x = (dx / dist) * radial * 0.6 + perpX * e.speed * 0.9;
        e.vel.y = (dy / dist) * radial * 0.6 + perpY * e.speed * 0.9;
        e.facing = { x: dx / dist, y: dy / dist };
        e.anim = "run";
        this.moveWithWalls(e.pos, { ...e.vel }, e.radius, dt);
        if ((e.telegraph ?? 0) <= 0) {
          const aim =
            e.attackKind === "predict"
              ? predictAim(e.pos, this.player.pos, this.player.vel, 480)
              : sub(this.player.pos, e.pos);
          for (let k = -1; k <= 1; k++) {
            const ang = Math.atan2(aim.y, aim.x) + k * 0.2;
            this.bullets.push({
              pos: { x: e.pos.x, y: e.pos.y },
              vel: { x: Math.cos(ang) * 380, y: Math.sin(ang) * 380 },
              life: 3.2, fromPlayer: false,
            });
          }
          e.telegraph = 1.6;
          e.attackTimer = 0.45;
          e.anim = "attack";
          this.shake = Math.max(this.shake, 4);
        }
        continue;
      }
      // chase player
      const dx = this.player.pos.x - e.pos.x;
      const dy = this.player.pos.y - e.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const tvx = (dx / d) * e.speed;
      const tvy = (dy / d) * e.speed;
      e.vel.x = lerp(e.vel.x, tvx, dt * 4);
      e.vel.y = lerp(e.vel.y, tvy, dt * 4);
      e.facing = { x: dx / d, y: dy / d };
      e.anim = Math.hypot(e.vel.x, e.vel.y) > 20 ? "run" : "idle";
      this.moveWithWalls(e.pos, { ...e.vel }, e.radius, dt);
    }
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.life -= dt;
    }
    // wall collision
    for (const b of this.bullets) {
      for (const w of this.walls) {
        if (b.pos.x > w.x && b.pos.x < w.x + w.w && b.pos.y > w.y && b.pos.y < w.y + w.h) {
          b.life = 0;
          this.spawnExplosion(b.pos.x, b.pos.y, b.fromPlayer ? "#00ffaa" : "#ff3b64", 4);
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(
      (b) => b.life > 0 && b.pos.x > -10 && b.pos.x < this.worldW + 10 && b.pos.y > -10 && b.pos.y < this.worldH + 10,
    );
  }

  private updateHazards(dt: number) {
    for (const h of this.hazards) {
      if (h.kind === "laser" || h.kind === "phase") h.phase += dt;
      if (h.kind === "stun_pylon") {
        h.cooldown -= dt;
        if (h.cooldown <= 0) {
          const dx = this.player.pos.x - h.x;
          const dy = this.player.pos.y - h.y;
          if (Math.hypot(dx, dy) < h.r) {
            this.player.stunned = 0.7;
            this.player.vel.x = 0; this.player.vel.y = 0;
            h.cooldown = h.charge + 1.5;
            this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#ffcc00", 12);
            this.shake = Math.max(this.shake, 6);
          }
        }
      }
      if (h.kind === "conveyor") {
        if (pointInRect(this.player.pos, h)) {
          this.player.pos.x += h.vx * dt;
          this.player.pos.y += h.vy * dt;
        }
      }
      if (h.kind === "anti_dash") {
        if (this.player.dashTime > 0) {
          const dx = this.player.pos.x - h.x;
          const dy = this.player.pos.y - h.y;
          if (Math.hypot(dx, dy) < h.r) {
            this.player.dashTime = 0;
            this.player.iFrames = 0;
            this.damagePlayer(15);
            this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#ff66ff", 16);
          }
        }
      }
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
      p.vel.x *= 1 - dt * 2;
      p.vel.y *= 1 - dt * 2;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private laserActive(h: Extract<Hazard, { kind: "laser" }>) {
    const t = (h.phase % h.period) / h.period;
    return t > 0.55;
  }
  private phaseSolid(h: Extract<Hazard, { kind: "phase" }>) {
    const t = (h.phase % h.period) / h.period;
    return t < 0.6;
  }

  private checkCollisions() {
    const p = this.player;
    for (const b of this.bullets) {
      if (!b.fromPlayer) continue;
      for (const e of this.enemies) {
        const dx = b.pos.x - e.pos.x;
        const dy = b.pos.y - e.pos.y;
        if (Math.hypot(dx, dy) < e.radius + 4) {
          b.life = 0;
          this.m.shotsHit++;
          if (e.shielded) {
            e.shielded = false;
            this.spawnExplosion(e.pos.x, e.pos.y, "#88ddff", 8);
            continue;
          }
          e.hp -= 1;
          e.hitFlash = 0.12;
          this.m.damageDealt += 1;
          this.spawnExplosion(b.pos.x, b.pos.y, "#00ffaa", 6);
          if (e.hp <= 0) { this.m.killsByShot++; this.killEnemy(e); }
          break;
        }
      }
    }
    for (const b of this.bullets) {
      if (b.fromPlayer) continue;
      const dx = b.pos.x - p.pos.x;
      const dy = b.pos.y - p.pos.y;
      if (Math.hypot(dx, dy) < PLAYER_RADIUS + 4) {
        b.life = 0;
        if (p.iFrames === 0) this.damagePlayer(8);
      }
    }
    for (const e of this.enemies) {
      const dx = e.pos.x - p.pos.x;
      const dy = e.pos.y - p.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < e.radius + PLAYER_RADIUS) {
        if (p.dashTime > 0 && !e.shielded) {
          e.hp -= 2; e.hitFlash = 0.15; this.m.damageDealt += 2;
          this.spawnExplosion(e.pos.x, e.pos.y, "#00f0ff", 14);
          if (e.hp <= 0) { this.m.killsByDash++; this.lastDashKilled = true; this.killEnemy(e); }
        } else if (p.iFrames === 0) {
          this.damagePlayer(e.isBoss ? 18 : 12);
        }
      }
    }
    for (const h of this.hazards) {
      if (h.kind === "laser" && this.laserActive(h)) {
        if (p.pos.x > h.x - PLAYER_RADIUS && p.pos.x < h.x + h.w + PLAYER_RADIUS &&
            p.pos.y > h.y && p.pos.y < h.y + h.h) {
          if (p.iFrames === 0) this.damagePlayer(20);
        }
      }
      if (h.kind === "phase" && this.phaseSolid(h)) {
        if (p.pos.x > h.x - PLAYER_RADIUS && p.pos.x < h.x + h.w + PLAYER_RADIUS &&
            p.pos.y > h.y - PLAYER_RADIUS && p.pos.y < h.y + h.h + PLAYER_RADIUS) {
          const overlaps = [
            { axis: "left", d: p.pos.x - (h.x - PLAYER_RADIUS) },
            { axis: "right", d: h.x + h.w + PLAYER_RADIUS - p.pos.x },
            { axis: "top", d: p.pos.y - (h.y - PLAYER_RADIUS) },
            { axis: "bottom", d: h.y + h.h + PLAYER_RADIUS - p.pos.y },
          ].sort((a, b) => a.d - b.d);
          const o = overlaps[0];
          if (o.axis === "left") p.pos.x = h.x - PLAYER_RADIUS;
          else if (o.axis === "right") p.pos.x = h.x + h.w + PLAYER_RADIUS;
          else if (o.axis === "top") p.pos.y = h.y - PLAYER_RADIUS;
          else p.pos.y = h.y + h.h + PLAYER_RADIUS;
        }
      }
    }
  }

  private damagePlayer(amt: number) {
    this.player.hp = Math.max(0, this.player.hp - amt);
    this.player.iFrames = 0.4;
    this.player.scaleX = 1.5; this.player.scaleY = 0.6;
    this.shake = Math.max(this.shake, 8);
    this.m.damageTaken += amt;
    this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#ff3b6b", 10);
  }

  private killEnemy(e: Enemy) {
    this.enemies = this.enemies.filter((x) => x.id !== e.id);
    this.spawnExplosion(e.pos.x, e.pos.y, e.isBoss ? "#ff00cc" : "#00f0ff", e.isBoss ? 50 : 14);
    this.shake = Math.max(this.shake, e.isBoss ? 18 : 4);
  }

  private spawnExplosion(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 220;
      this.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7, color, size: 2 + Math.random() * 3,
      });
    }
  }
}

function lerp(a: number, b: number, t: number) {
  const tt = Math.min(1, Math.max(0, t));
  return a + (b - a) * tt;
}
function sub(a: Vec, b: Vec): Vec { return { x: a.x - b.x, y: a.y - b.y }; }
function pointInRect(p: Vec, r: { x: number; y: number; w: number; h: number }) {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}
function predictAim(from: Vec, target: Vec, targetVel: Vec, bulletSpeed: number): Vec {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.hypot(dx, dy);
  const t = dist / bulletSpeed;
  const px = target.x + targetVel.x * t - from.x;
  const py = target.y + targetVel.y * t - from.y;
  return { x: px, y: py };
}
