import type {
  Bullet, Enemy, EnemyClass, Hazard, Particle, Pickup, Player, Vec, Wall, AnimState, Difficulty,
} from "./types";
import { DIFFICULTY_PRESETS, LEVEL_TIME_LIMITS } from "./types";
import type { LevelConfig, PlayerMetrics } from "@/lib/warden.functions";

export const VIEW_W = 900;
export const VIEW_H = 600;
export const ARENA_W = VIEW_W;
export const ARENA_H = VIEW_H;

const PLAYER_RADIUS = 22; // bigger sprite
const PLAYER_MAX_SPEED = 195;
const PLAYER_ACCEL = 13;
const PLAYER_FRICTION = 10;
const DASH_SPEED = 520;
const DASH_DURATION = 0.18;
const DASH_CD = 0.7;
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
  | { type: "death"; reason?: string }
  | { type: "warden_taunt"; msg: string };

const WORLD_SIZES: Record<number, { w: number; h: number }> = {
  1: { w: 2400, h: 1600 },
  2: { w: 2800, h: 1900 },
  3: { w: 3200, h: 2200 },
  4: { w: 2400, h: 1800 },
};

// per-class speed multiplier applied on top of base enemy speed
const CLASS_SPEED_MUL: Record<EnemyClass, number> = {
  drone: 0.85,
  shooter: 0.8,
  sniper: 0.55,
  slasher: 1.25,
  shield: 0.55,
  boss: 0.7,
};

// per-class hp multiplier
const CLASS_HP_MUL: Record<EnemyClass, number> = {
  drone: 1,
  shooter: 1.5,
  sniper: 1.2,
  slasher: 1.8,
  shield: 4.5,
  boss: 1,
};

const CLASS_RADIUS: Record<EnemyClass, number> = {
  drone: 18,
  shooter: 20,
  sniper: 19,
  slasher: 20,
  shield: 26,
  boss: 60,
};

export class GameEngine {
  player!: Player;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  hazards: Hazard[] = [];
  particles: Particle[] = [];
  walls: Wall[] = [];
  pickups: Pickup[] = [];
  level = 1;
  worldW = 1600;
  worldH = 1100;
  cam: Vec = { x: 0, y: 0 };
  state: EngineState = "countdown";
  countdown = 3;
  victoryHold = 0;
  config: LevelConfig | null = null;
  elapsed = 0;
  shake = 0;
  difficulty: Difficulty = "easy";
  timeLimit = 180;
  timeLeft = 180;
  exitGate: { x: number; y: number; r: number; open: boolean } = { x: 0, y: 0, r: 60, open: false };
  blindActive = 0;         // seconds remaining
  stunWarn = 0;            // seconds left on warning telegraph (before stun)
  bossKilled = false;

  m = {
    damageDealt: 0,
    damageTaken: 0,
    dashCount: 0,
    shotsFired: 0,
    shotsHit: 0,
    killsByDash: 0,
    killsByShot: 0,
  };

  keys = new Set<string>();
  pointer: Vec = { x: VIEW_W / 2, y: VIEW_H / 2 };
  pointerDown = false;
  private buffer: { action: Action; t: number }[] = [];
  virtualMove: Vec = { x: 0, y: 0 };

  onEvent: (e: GameEvent) => void = () => {};
  private nextId = 1;

  constructor() {
    this.resetPlayer(true);
  }

  resetPlayer(fullReset: boolean) {
    const healUsed = fullReset ? false : this.player?.healUsed ?? false;
    this.player = {
      pos: { x: 220, y: this.worldH / 2 },
      vel: { x: 0, y: 0 },
      hp: 100,
      maxHp: 100,
      facing: { x: 1, y: 0 },
      dashCd: 0, dashTime: 0, iFrames: 0,
      shootCd: 0,
      scaleX: 1, scaleY: 1,
      stunned: 0,
      animTime: 0,
      anim: "idle",
      attackSwing: 0,
      healUsed,
    };
  }

  setDifficulty(d: Difficulty) {
    this.difficulty = d;
  }

  loadLevel(cfg: LevelConfig) {
    this.config = cfg;
    this.level = cfg.nextLevel;
    const ws = WORLD_SIZES[this.level] ?? WORLD_SIZES[1];
    this.worldW = ws.w;
    this.worldH = ws.h;
    this.elapsed = 0;
    this.enemies = [];
    this.bullets = [];
    this.hazards = [];
    this.particles = [];
    this.walls = [];
    this.pickups = [];
    this.blindActive = 0;
    this.stunWarn = 0;
    this.bossKilled = false;
    this.m = { damageDealt: 0, damageTaken: 0, dashCount: 0, shotsFired: 0, shotsHit: 0, killsByDash: 0, killsByShot: 0 };
    this.resetPlayer(true);
    this.timeLimit = LEVEL_TIME_LIMITS[this.level] ?? 180;
    this.timeLeft = this.timeLimit;
    const gateY =
      this.level === 3 ? 1300 :
      this.level === 1 ? this.worldH - 200 :
      this.worldH / 2;
    this.exitGate = { x: this.worldW - 140, y: gateY, r: 70, open: false };
    this.buildWalls();
    this.spawnEnemies(cfg);
    this.spawnHazards(cfg);
    if (this.level === 4) {
      // healing item: far corner from boss
      this.pickups.push({ kind: "heal", pos: { x: 200, y: this.worldH - 200 }, r: 22, taken: false });
    }
    this.state = "countdown";
    this.countdown = 3;
    this.victoryHold = 0;
    this.updateCamera();
    this.onEvent({ type: "warden_taunt", msg: cfg.taunt });
    cfg.reasoning.forEach((r) => this.onEvent({ type: "trace", msg: r }));
  }

  private buildWalls() {
    const t = 32;
    this.walls.push({ x: 0, y: 0, w: this.worldW, h: t, kind: "wall" });
    this.walls.push({ x: 0, y: this.worldH - t, w: this.worldW, h: t, kind: "wall" });
    this.walls.push({ x: 0, y: 0, w: t, h: this.worldH, kind: "wall" });
    this.walls.push({ x: this.worldW - t, y: 0, w: t, h: this.worldH, kind: "wall" });

    const cx = this.worldW / 2;
    const cy = this.worldH / 2;
    if (this.level === 1) {
      // two vestibule walls with a passage
      this.walls.push({ x: 700, y: 0, w: t, h: cy - 140, kind: "wall" });
      this.walls.push({ x: 700, y: cy + 140, w: t, h: this.worldH - (cy + 140), kind: "wall" });
      this.walls.push({ x: 1500, y: 250, w: t, h: this.worldH - 500, kind: "wall" });
    } else if (this.level === 2) {
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 4; j++) {
          this.walls.push({ x: 380 + i * 420, y: 280 + j * 350, w: 100, h: 100, kind: "wall" });
        }
      }
      this.walls.push({ x: cx - t / 2, y: 0, w: t, h: cy - 200, kind: "wall" });
      this.walls.push({ x: cx - t / 2, y: cy + 200, w: t, h: this.worldH - (cy + 200), kind: "wall" });
    } else if (this.level === 3) {
      // labyrinth: many corridors
      this.walls.push({ x: 500, y: 200, w: t, h: 900, kind: "wall" });
      this.walls.push({ x: 900, y: 100, w: t, h: 700, kind: "wall" });
      this.walls.push({ x: 900, y: 900, w: t, h: 700, kind: "wall" });
      this.walls.push({ x: 1400, y: 300, w: t, h: 1200, kind: "wall" });
      this.walls.push({ x: 1900, y: 100, w: t, h: 900, kind: "wall" });
      this.walls.push({ x: 1900, y: 1200, w: t, h: 700, kind: "wall" });
      this.walls.push({ x: 2400, y: 300, w: t, h: 900, kind: "wall" });
      this.walls.push({ x: 2400, y: 1400, w: t, h: 500, kind: "wall" });
      // horizontal barriers
      this.walls.push({ x: 600, y: 1100, w: 300, h: t, kind: "wall" });
      this.walls.push({ x: 1500, y: 600, w: 380, h: t, kind: "wall" });
      this.walls.push({ x: 2000, y: 1100, w: 380, h: t, kind: "wall" });
    } else if (this.level === 4) {
      // boss colosseum: ring of large pillars + corridor to heal pickup
      const ringR = 540;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        this.walls.push({
          x: cx + Math.cos(a) * ringR - 40,
          y: cy + Math.sin(a) * ringR - 40,
          w: 80, h: 80, kind: "wall",
        });
      }
      // partition guarding the heal pickup corridor
      this.walls.push({ x: 380, y: this.worldH - 360, w: t, h: 280, kind: "wall" });
      this.walls.push({ x: 80, y: this.worldH - 360, w: 330, h: t, kind: "wall" });
    }
  }

  private spawnEnemies(cfg: LevelConfig) {
    const cx = this.worldW / 2;
    const cy = this.worldH / 2;
    if (this.level === 4) {
      this.enemies.push(this.makeEnemy("boss", { x: cx, y: cy - 180 }, cfg));
      return;
    }
    // determine composition by level
    let comp: EnemyClass[] = [];
    if (this.level === 1) {
      comp = ["drone", "drone", "drone", "drone", "drone", "shooter"];
    } else if (this.level === 2) {
      comp = ["drone", "drone", "shooter", "shooter", "shooter", "slasher", "sniper"];
    } else if (this.level === 3) {
      comp = ["shooter", "shooter", "sniper", "sniper", "slasher", "slasher", "shield", "shield"];
    }
    const presets = DIFFICULTY_PRESETS[this.difficulty];
    const total = Math.max(3, Math.round(comp.length * presets.countMul * (0.85 + cfg.enemyCount / 12)));
    // extend by repeating composition pattern
    const expanded: EnemyClass[] = [];
    for (let i = 0; i < total; i++) expanded.push(comp[i % comp.length]);

    for (let i = 0; i < expanded.length; i++) {
      const cls = expanded[i];
      const a = (i / expanded.length) * Math.PI * 2;
      const ring = 380 + (i % 3) * 120;
      let pos: Vec = {
        x: cx + Math.cos(a) * ring + (Math.random() - 0.5) * 120,
        y: cy + Math.sin(a) * ring + (Math.random() - 0.5) * 120,
      };
      pos.x = Math.max(80, Math.min(this.worldW - 80, pos.x));
      pos.y = Math.max(80, Math.min(this.worldH - 80, pos.y));
      pos = this.nudgeOutOfWalls(pos, 24);
      this.enemies.push(this.makeEnemy(cls, pos, cfg));
    }
  }

  private makeEnemy(cls: EnemyClass, pos: Vec, cfg: LevelConfig): Enemy {
    const presets = DIFFICULTY_PRESETS[this.difficulty];
    const baseHp = cls === "boss" ? 220 : (cfg.enemyHp * 2 + 2);
    const hp = Math.max(1, Math.round(baseHp * CLASS_HP_MUL[cls] * presets.hpMul));
    const speed = cfg.enemySpeed * CLASS_SPEED_MUL[cls];
    return {
      id: this.nextId++,
      cls,
      pos,
      vel: { x: 0, y: 0 },
      hp, maxHp: hp,
      speed,
      radius: CLASS_RADIUS[cls],
      hitFlash: 0,
      animTime: Math.random() * 2,
      facing: { x: 1, y: 0 },
      anim: "idle",
      attackTimer: 0,
      shootCd: Math.random() * 1.5,
      dashCd: cls === "slasher" ? 1 + Math.random() * 2 : 0,
      dashTime: 0,
      shieldActive: false,
      isBoss: cls === "boss",
      bossPhase: cls === "boss" ? 1 : undefined,
      stunCd: cls === "boss" ? 18 : undefined,
      blindCd: cls === "boss" ? 30 : undefined,
      spawnCd: cls === "boss" ? 22 : undefined,
      telegraph: cls === "boss" ? 2.4 : undefined,
      attackKind: cls === "boss" ? (cfg.bossPhase === "sweep" ? "sweep" : "predict") : undefined,
    };
  }

  private nudgeOutOfWalls(p: Vec, r: number): Vec {
    let out = { ...p };
    for (let i = 0; i < 6; i++) {
      let hit = false;
      for (const w of this.walls) {
        if (
          out.x + r > w.x && out.x - r < w.x + w.w &&
          out.y + r > w.y && out.y - r < w.y + w.h
        ) {
          hit = true;
          out.x += 80;
          if (out.x > this.worldW - 80) { out.x = 200; out.y += 80; }
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
            x: 700 + i * 500,
            y: 240,
            w: 14,
            h: this.worldH - 480,
            phase: i * 0.6,
            period: 2.2,
          });
        }
      } else if (h === "conveyor") {
        this.hazards.push({ kind: "conveyor", x: 400, y: cy - 60, w: this.worldW - 800, h: 120, vx: 100, vy: 0 });
      } else if (h === "phase") {
        for (let i = 0; i < 4; i++) {
          this.hazards.push({
            kind: "phase",
            x: 700 + i * 380,
            y: 320 + (i % 2) * 320,
            w: 100,
            h: 100,
            phase: i * 0.4,
            period: 2.6,
          });
        }
      } else if (h === "stun_pylon") {
        for (let i = 0; i < 3; i++) {
          this.hazards.push({
            kind: "stun_pylon",
            x: 520 + i * 480,
            y: 280 + (i % 2) * (this.worldH - 560),
            r: 90, cooldown: 0, charge: 1 + i * 0.5,
          });
        }
      } else if (h === "anti_dash") {
        for (let i = 0; i < 4; i++) {
          this.hazards.push({
            kind: "anti_dash",
            x: 500 + (i % 2) * (this.worldW - 1000),
            y: 300 + Math.floor(i / 2) * (this.worldH - 600),
            r: 80,
          });
        }
      }
    }
  }

  pressAction(a: Action) {
    this.buffer.push({ action: a, t: this.elapsed });
  }
  private consumeBuffer(a: Action): boolean {
    const idx = this.buffer.findIndex((b) => b.action === a && this.elapsed - b.t < INPUT_BUFFER_TIME);
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

  pointerWorld(): Vec {
    return { x: this.pointer.x + this.cam.x, y: this.pointer.y + this.cam.y };
  }

  update(dt: number) {
    if (this.state === "countdown") {
      this.countdown -= dt;
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
        this.state = "countdown";
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
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.blindActive > 0) this.blindActive = Math.max(0, this.blindActive - dt);
    if (this.stunWarn > 0) {
      this.stunWarn = Math.max(0, this.stunWarn - dt);
      if (this.stunWarn === 0) {
        // trigger actual stun
        this.player.stunned = 1.4;
        this.shake = Math.max(this.shake, 10);
        this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#ffcc00", 18);
        this.onEvent({ type: "trace", msg: "STUN PULSE detonated — Aegis locked." });
      }
    }

    this.buffer = this.buffer.filter((b) => this.elapsed - b.t < INPUT_BUFFER_TIME);
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateHazards(dt);
    this.updateParticles(dt);
    this.updatePickups();
    this.checkCollisions();
    this.updateCamera();
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);

    if (this.timeLeft <= 0 && this.player.hp > 0) {
      this.player.hp = 0;
      this.state = "dead";
      this.shake = 14;
      this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#ff3b6b", 50);
      this.onEvent({ type: "death", reason: "Time expired — Warden purge engaged." });
      return;
    }
    if (this.player.hp <= 0) {
      this.state = "dead";
      this.shake = 14;
      this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#ff3b6b", 50);
      this.onEvent({ type: "death" });
      return;
    }
    // victory condition
    const aliveEnemies = this.enemies.length;
    if (this.level === 4) {
      if (this.bossKilled) {
        this.state = "victory";
        this.victoryHold = 2.4;
        this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#00f0ff", 30);
      }
    } else {
      // gate opens when all enemies cleared; reach gate to clear level
      this.exitGate.open = aliveEnemies === 0;
      if (this.exitGate.open) {
        const dx = this.player.pos.x - this.exitGate.x;
        const dy = this.player.pos.y - this.exitGate.y;
        if (Math.hypot(dx, dy) < this.exitGate.r + PLAYER_RADIUS - 6) {
          this.state = "victory";
          this.victoryHold = 2.2;
          this.player.attackSwing = 0;
          this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#00f0ff", 30);
        }
      }
    }
  }

  private updateCamera() {
    const targetX = this.player.pos.x - VIEW_W / 2;
    const targetY = this.player.pos.y - VIEW_H / 2;
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
      p.scaleX = 1 + Math.abs(dir.x) * 0.16;
      p.scaleY = 1 + Math.abs(dir.y) * 0.16;
    } else {
      p.vel.x = lerp(p.vel.x, 0, dt * PLAYER_FRICTION);
      p.vel.y = lerp(p.vel.y, 0, dt * PLAYER_FRICTION);
    }

    if (p.iFrames > 0.25 && p.dashTime === 0) p.anim = "hit";
    else if (p.dashTime > 0) p.anim = "dash";
    else if (p.attackSwing > 0.4) p.anim = "attack";
    else if (Math.hypot(p.vel.x, p.vel.y) > 40) p.anim = "run";
    else p.anim = "idle";

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
      for (let i = 0; i < 12; i++) {
        this.particles.push({
          pos: { x: p.pos.x, y: p.pos.y },
          vel: { x: -p.vel.x * 0.2 + (Math.random() - 0.5) * 40, y: -p.vel.y * 0.2 + (Math.random() - 0.5) * 40 },
          life: 0.4, maxLife: 0.4, color: "#9d4dff", size: 4 + Math.random() * 3,
        });
      }
    }

    if (p.shootCd === 0 && p.stunned === 0 && this.consumeBuffer("shoot")) {
      const aim = this.aimDir();
      // sword tip distance ~ player radius + 30
      const tipDist = PLAYER_RADIUS + 30;
      this.bullets.push({
        pos: { x: p.pos.x + aim.x * tipDist, y: p.pos.y + aim.y * tipDist },
        vel: { x: aim.x * BULLET_SPEED, y: aim.y * BULLET_SPEED },
        life: 3.5, fromPlayer: true, damage: 1,
      });
      // muzzle flash particles at sword tip
      for (let i = 0; i < 8; i++) {
        const a = Math.atan2(aim.y, aim.x) + (Math.random() - 0.5) * 0.7;
        const s = 80 + Math.random() * 180;
        this.particles.push({
          pos: { x: p.pos.x + aim.x * tipDist, y: p.pos.y + aim.y * tipDist },
          vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
          life: 0.25, maxLife: 0.25, color: "#00ffaa", size: 2 + Math.random() * 2,
        });
      }
      p.shootCd = SHOOT_CD;
      p.facing = aim;
      p.attackSwing = 1;
      this.m.shotsFired++;
      p.scaleX = 1.25; p.scaleY = 0.88;
    }

    if (this.pointerDown && p.shootCd === 0 && p.stunned === 0) {
      this.pressAction("shoot");
    }

    this.moveWithWalls(p.pos, p.vel, PLAYER_RADIUS, dt);
    p.pos.x = Math.max(PLAYER_RADIUS, Math.min(this.worldW - PLAYER_RADIUS, p.pos.x));
    p.pos.y = Math.max(PLAYER_RADIUS, Math.min(this.worldH - PLAYER_RADIUS, p.pos.y));
  }

  private moveWithWalls(pos: Vec, vel: Vec, r: number, dt: number) {
    pos.x += vel.x * dt;
    for (const w of this.walls) {
      if (pos.x + r > w.x && pos.x - r < w.x + w.w && pos.y + r > w.y && pos.y - r < w.y + w.h) {
        if (vel.x > 0) pos.x = w.x - r;
        else if (vel.x < 0) pos.x = w.x + w.w + r;
        vel.x = 0;
      }
    }
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
      e.shootCd = Math.max(0, e.shootCd - dt);
      e.dashCd = Math.max(0, e.dashCd - dt);
      e.dashTime = Math.max(0, e.dashTime - dt);
      if (e.isBoss) { this.updateBoss(e, dt); continue; }

      const dx = this.player.pos.x - e.pos.x;
      const dy = this.player.pos.y - e.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const dirToPlayer = { x: dx / d, y: dy / d };
      e.facing = dirToPlayer;

      switch (e.cls) {
        case "drone": {
          const tvx = dirToPlayer.x * e.speed;
          const tvy = dirToPlayer.y * e.speed;
          e.vel.x = lerp(e.vel.x, tvx, dt * 4);
          e.vel.y = lerp(e.vel.y, tvy, dt * 4);
          break;
        }
        case "shooter": {
          // mid range: keep at ~260 distance and shoot; when very close use dagger
          const desired = 280;
          const drive = d > desired ? 1 : d < 200 ? -0.6 : 0;
          const tvx = dirToPlayer.x * e.speed * drive;
          const tvy = dirToPlayer.y * e.speed * drive;
          e.vel.x = lerp(e.vel.x, tvx, dt * 3);
          e.vel.y = lerp(e.vel.y, tvy, dt * 3);
          if (d < 70) {
            // dagger melee
            if (e.attackTimer === 0) e.attackTimer = 0.4;
          } else if (d < 520 && e.shootCd === 0) {
            this.enemyShoot(e, dirToPlayer, 320, 1);
            e.shootCd = 1.4 + Math.random() * 0.4;
          }
          break;
        }
        case "sniper": {
          // long range only; flee if too close
          const desired = 560;
          const drive = d > desired + 60 ? 0.6 : d < desired - 80 ? -1 : 0;
          const tvx = dirToPlayer.x * e.speed * drive;
          const tvy = dirToPlayer.y * e.speed * drive;
          e.vel.x = lerp(e.vel.x, tvx, dt * 3);
          e.vel.y = lerp(e.vel.y, tvy, dt * 3);
          if (d > 420 && e.shootCd === 0) {
            // charged predictive shot
            this.enemyShoot(e, normalize(predictAim(e.pos, this.player.pos, this.player.vel, 460)), 460, 2, true);
            e.shootCd = 2.6;
          }
          break;
        }
        case "slasher": {
          // faster, periodic dash
          let speed = e.speed;
          if (e.dashTime > 0) speed = e.speed * 3.6;
          const tvx = dirToPlayer.x * speed;
          const tvy = dirToPlayer.y * speed;
          e.vel.x = lerp(e.vel.x, tvx, dt * 6);
          e.vel.y = lerp(e.vel.y, tvy, dt * 6);
          if (e.dashCd === 0 && d > 80 && d < 360) {
            e.dashTime = 0.32;
            e.dashCd = 3.0;
            for (let i = 0; i < 8; i++) {
              this.particles.push({
                pos: { ...e.pos }, vel: { x: -dirToPlayer.x * 60 + (Math.random() - 0.5) * 30, y: -dirToPlayer.y * 60 + (Math.random() - 0.5) * 30 },
                life: 0.3, maxLife: 0.3, color: "#ff66aa", size: 3,
              });
            }
          }
          if (d < 50) { if (e.attackTimer === 0) e.attackTimer = 0.3; }
          break;
        }
        case "shield": {
          if (!e.shieldActive && e.hp / e.maxHp < 0.5) {
            e.shieldActive = true;
            this.spawnExplosion(e.pos.x, e.pos.y, "#88ddff", 14);
          }
          if (e.shieldActive) {
            // find nearest sniper to escort: move slowly to it, then anchor; can't move when next to sniper
            const sniper = this.enemies
              .filter((x) => x.cls === "sniper" && !x.isBoss)
              .sort((a, b) => dist2(a.pos, e.pos) - dist2(b.pos, e.pos))[0];
            if (sniper) {
              const sx = sniper.pos.x - e.pos.x;
              const sy = sniper.pos.y - e.pos.y;
              const sd = Math.hypot(sx, sy) || 1;
              if (sd > 60) {
                const sp = e.speed * 0.6;
                e.vel.x = lerp(e.vel.x, (sx / sd) * sp, dt * 3);
                e.vel.y = lerp(e.vel.y, (sy / sd) * sp, dt * 3);
              } else {
                e.vel.x = lerp(e.vel.x, 0, dt * 8);
                e.vel.y = lerp(e.vel.y, 0, dt * 8);
              }
            } else {
              e.vel.x = lerp(e.vel.x, 0, dt * 8);
              e.vel.y = lerp(e.vel.y, 0, dt * 8);
            }
          } else {
            // pre-shield: lumber toward player
            const tvx = dirToPlayer.x * e.speed;
            const tvy = dirToPlayer.y * e.speed;
            e.vel.x = lerp(e.vel.x, tvx, dt * 3);
            e.vel.y = lerp(e.vel.y, tvy, dt * 3);
          }
          break;
        }
      }
      e.anim = Math.hypot(e.vel.x, e.vel.y) > 20 ? "run" : "idle";
      if (e.attackTimer > 0) e.anim = "attack";
      this.moveWithWalls(e.pos, { ...e.vel }, e.radius, dt);
    }
  }

  private enemyShoot(e: Enemy, dir: Vec, speed: number, damage: number, big = false) {
    const a = Math.atan2(dir.y, dir.x);
    this.bullets.push({
      pos: { x: e.pos.x + Math.cos(a) * e.radius, y: e.pos.y + Math.sin(a) * e.radius },
      vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
      life: 3.5, fromPlayer: false, damage, big,
    });
  }

  private updateBoss(e: Enemy, dt: number) {
    // phase transition
    if ((e.bossPhase ?? 1) === 1 && e.hp / e.maxHp <= 0.5) {
      e.bossPhase = 2;
      e.radius = 78;
      e.speed *= 1.15;
      this.shake = Math.max(this.shake, 12);
      this.spawnExplosion(e.pos.x, e.pos.y, "#ff00cc", 40);
      this.onEvent({ type: "warden_taunt", msg: "PHASE TWO. Your bullets are noise to me." });
    }
    // motion: orbit player at distance
    const dx = this.player.pos.x - e.pos.x;
    const dy = this.player.pos.y - e.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const desired = (e.bossPhase === 2) ? 220 : 300;
    const radial = (dist - desired) * 1.4;
    const perpX = -dy / dist;
    const perpY = dx / dist;
    e.vel.x = (dx / dist) * radial * 0.6 + perpX * e.speed * 0.9;
    e.vel.y = (dy / dist) * radial * 0.6 + perpY * e.speed * 0.9;
    e.facing = { x: dx / dist, y: dy / dist };
    e.anim = "run";
    this.moveWithWalls(e.pos, { ...e.vel }, e.radius, dt);

    // projectile attack
    e.telegraph = (e.telegraph ?? 0) - dt;
    if ((e.telegraph ?? 0) <= 0) {
      const aim = predictAim(e.pos, this.player.pos, this.player.vel, 460);
      const baseAng = Math.atan2(aim.y, aim.x);
      const spread = e.bossPhase === 2 ? 5 : 3;
      for (let k = -Math.floor(spread / 2); k <= Math.floor(spread / 2); k++) {
        const ang = baseAng + k * 0.22;
        this.bullets.push({
          pos: { x: e.pos.x, y: e.pos.y },
          vel: { x: Math.cos(ang) * 420, y: Math.sin(ang) * 420 },
          life: 3.6, fromPlayer: false, damage: e.bossPhase === 2 ? 3 : 2, big: true,
        });
      }
      e.telegraph = e.bossPhase === 2 ? 1.1 : 1.7;
      e.attackTimer = 0.45;
      e.anim = "attack";
      this.shake = Math.max(this.shake, 4);
    }

    // ability: stun (50s CD, 3s warning)
    e.stunCd = (e.stunCd ?? 0) - dt;
    if ((e.stunCd ?? 0) <= 0 && this.stunWarn === 0 && this.player.stunned === 0) {
      this.stunWarn = 3;
      e.stunCd = 50;
      this.onEvent({ type: "warden_taunt", msg: "Lockdown protocol charging — BREAK CONTACT." });
    }

    // ability: blind (cooldown 35s)
    e.blindCd = (e.blindCd ?? 0) - dt;
    if ((e.blindCd ?? 0) <= 0 && this.blindActive === 0) {
      this.blindActive = 6.5;
      e.blindCd = 35;
      this.shake = Math.max(this.shake, 6);
      this.onEvent({ type: "warden_taunt", msg: "Optic suppression engaged. Welcome to my dark." });
    }

    // ability: spawn adds (phase 2 spawns more often)
    e.spawnCd = (e.spawnCd ?? 0) - dt;
    if ((e.spawnCd ?? 0) <= 0) {
      const classes: EnemyClass[] = e.bossPhase === 2
        ? ["slasher", "sniper", "shooter", "shield"]
        : ["shooter", "slasher"];
      const count = e.bossPhase === 2 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const cls = classes[Math.floor(Math.random() * classes.length)];
        const a = Math.random() * Math.PI * 2;
        const r = 380;
        const pos = this.nudgeOutOfWalls({
          x: e.pos.x + Math.cos(a) * r,
          y: e.pos.y + Math.sin(a) * r,
        }, 24);
        this.enemies.push(this.makeEnemy(cls, pos, this.config!));
      }
      e.spawnCd = e.bossPhase === 2 ? 18 : 28;
      this.onEvent({ type: "trace", msg: `Boss summons ${count} ${e.bossPhase === 2 ? "elite" : "drone"} reinforcements.` });
    }
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.life -= dt;
    }
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

  private updatePickups() {
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      const dx = this.player.pos.x - pk.pos.x;
      const dy = this.player.pos.y - pk.pos.y;
      if (Math.hypot(dx, dy) < pk.r + PLAYER_RADIUS - 4) {
        pk.taken = true;
        if (pk.kind === "heal" && !this.player.healUsed) {
          this.player.healUsed = true;
          this.player.hp = this.player.maxHp;
          this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#00ffaa", 30);
          this.onEvent({ type: "trace", msg: "MED-CORE consumed: HP restored to 100%." });
        }
      }
    }
    this.pickups = this.pickups.filter((p) => !p.taken);
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
    const presets = DIFFICULTY_PRESETS[this.difficulty];

    // player bullets vs enemies
    for (const b of this.bullets) {
      if (!b.fromPlayer) continue;
      for (const e of this.enemies) {
        const dx = b.pos.x - e.pos.x;
        const dy = b.pos.y - e.pos.y;
        if (Math.hypot(dx, dy) < e.radius + 4) {
          // shield class deflects bullets fully while active
          if (e.cls === "shield" && e.shieldActive) {
            b.life = 0;
            this.spawnExplosion(b.pos.x, b.pos.y, "#88ddff", 6);
            continue;
          }
          // boss phase 2 immune to bullets
          if (e.isBoss && e.bossPhase === 2) {
            b.life = 0;
            this.spawnExplosion(b.pos.x, b.pos.y, "#ff44dd", 4);
            continue;
          }
          // shield aura also protects nearby snipers while active
          const protectedBy = this.enemies.find((s) =>
            s.cls === "shield" && s.shieldActive &&
            Math.hypot(s.pos.x - e.pos.x, s.pos.y - e.pos.y) < 80 && s.id !== e.id,
          );
          if (protectedBy) {
            b.life = 0;
            this.spawnExplosion(b.pos.x, b.pos.y, "#88ddff", 4);
            continue;
          }
          b.life = 0;
          this.m.shotsHit++;
          const dmg = b.damage ?? 1;
          e.hp -= dmg;
          e.hitFlash = 0.12;
          this.m.damageDealt += dmg;
          this.spawnExplosion(b.pos.x, b.pos.y, "#00ffaa", 6);
          if (e.hp <= 0) {
            this.m.killsByShot++;
            this.killEnemy(e);
          }
          break;
        }
      }
    }
    // enemy bullets vs player
    for (const b of this.bullets) {
      if (b.fromPlayer) continue;
      const dx = b.pos.x - p.pos.x;
      const dy = b.pos.y - p.pos.y;
      if (Math.hypot(dx, dy) < PLAYER_RADIUS + (b.big ? 6 : 4)) {
        b.life = 0;
        if (p.iFrames === 0) this.damagePlayer(Math.round((b.damage ?? 1) * 6 * presets.dmgMul));
      }
    }
    // enemy melee contact
    for (const e of this.enemies) {
      const dx = e.pos.x - p.pos.x;
      const dy = e.pos.y - p.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < e.radius + PLAYER_RADIUS) {
        if (p.dashTime > 0 && !(e.cls === "shield" && e.shieldActive) && !(e.isBoss && e.bossPhase === 2)) {
          const dmg = e.isBoss ? 4 : 3;
          e.hp -= dmg;
          e.hitFlash = 0.15;
          this.m.damageDealt += dmg;
          this.spawnExplosion(e.pos.x, e.pos.y, "#00f0ff", 14);
          if (e.hp <= 0) { this.m.killsByDash++; this.killEnemy(e); }
        } else if (p.iFrames === 0) {
          const base = e.isBoss
            ? (e.bossPhase === 2 ? 26 : 18)
            : e.cls === "slasher" ? 14
            : e.cls === "shooter" ? 10
            : e.cls === "shield" ? 16
            : 10;
          this.damagePlayer(Math.round(base * presets.dmgMul));
        }
      }
    }
    // hazards
    for (const h of this.hazards) {
      if (h.kind === "laser" && this.laserActive(h)) {
        if (p.pos.x > h.x - PLAYER_RADIUS && p.pos.x < h.x + h.w + PLAYER_RADIUS &&
            p.pos.y > h.y && p.pos.y < h.y + h.h) {
          if (p.iFrames === 0) this.damagePlayer(Math.round(20 * presets.dmgMul));
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
    if (e.isBoss) this.bossKilled = true;
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
function dist2(a: Vec, b: Vec) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
function normalize(v: Vec): Vec { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }
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
