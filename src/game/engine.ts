import type { Bullet, Enemy, Hazard, Particle, Player, Vec } from "./types";
import type { LevelConfig, PlayerMetrics } from "@/lib/warden.functions";

export const ARENA_W = 900;
export const ARENA_H = 600;

const PLAYER_RADIUS = 14;
const PLAYER_MAX_SPEED = 280;
const PLAYER_ACCEL = 14; // lerp factor (per frame at 60fps feel)
const PLAYER_FRICTION = 10;
const DASH_SPEED = 720;
const DASH_DURATION = 0.16;
const DASH_CD = 0.55;
const DASH_IFRAMES = 0.22;
const SHOOT_CD = 0.22;
const BULLET_SPEED = 520;
const INPUT_BUFFER_TIME = 0.12;

type Action = "dash" | "shoot";

export type GameEvent =
  | { type: "trace"; msg: string }
  | { type: "metrics"; metrics: PlayerMetrics }
  | { type: "level_cleared"; metrics: PlayerMetrics }
  | { type: "death" }
  | { type: "warden_taunt"; msg: string };

export class GameEngine {
  player!: Player;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  hazards: Hazard[] = [];
  particles: Particle[] = [];
  level = 1;
  config: LevelConfig | null = null;
  elapsed = 0;
  shake = 0;
  dead = false;
  cleared = false;

  // metrics
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

  // input
  keys = new Set<string>();
  pointer: Vec = { x: ARENA_W / 2, y: ARENA_H / 2 };
  pointerDown = false;
  private buffer: { action: Action; t: number }[] = [];

  onEvent: (e: GameEvent) => void = () => {};
  private nextId = 1;

  constructor() {
    this.resetPlayer();
  }

  resetPlayer() {
    this.player = {
      pos: { x: ARENA_W / 2, y: ARENA_H / 2 },
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
    };
  }

  loadLevel(cfg: LevelConfig) {
    this.config = cfg;
    this.level = cfg.nextLevel;
    this.elapsed = 0;
    this.cleared = false;
    this.dead = false;
    this.enemies = [];
    this.bullets = [];
    this.hazards = [];
    this.particles = [];
    this.m = { damageDealt: 0, damageTaken: 0, dashCount: 0, shotsFired: 0, shotsHit: 0, killsByDash: 0, killsByShot: 0 };
    this.resetPlayer();
    this.spawnEnemies(cfg);
    this.spawnHazards(cfg);
    this.onEvent({ type: "warden_taunt", msg: cfg.taunt });
    cfg.reasoning.forEach((r) => this.onEvent({ type: "trace", msg: r }));
  }

  private spawnEnemies(cfg: LevelConfig) {
    if (this.level === 4) {
      // Boss + adds
      this.enemies.push({
        id: this.nextId++,
        pos: { x: ARENA_W / 2, y: 140 },
        vel: { x: 0, y: 0 },
        hp: 60,
        maxHp: 60,
        speed: cfg.enemySpeed * 0.6,
        radius: 36,
        shielded: false,
        isBoss: true,
        telegraph: 2.5,
        attackKind: cfg.bossPhase === "sweep" ? "sweep" : "predict",
        hitFlash: 0,
      });
      const adds = Math.min(3, cfg.enemyCount);
      for (let i = 0; i < adds; i++) {
        const a = (i / adds) * Math.PI * 2;
        this.enemies.push({
          id: this.nextId++,
          pos: { x: ARENA_W / 2 + Math.cos(a) * 220, y: 300 + Math.sin(a) * 120 },
          vel: { x: 0, y: 0 },
          hp: cfg.enemyHp,
          maxHp: cfg.enemyHp,
          speed: cfg.enemySpeed,
          radius: 12,
          shielded: cfg.hazards.includes("shield_drone"),
          hitFlash: 0,
        });
      }
      return;
    }
    for (let i = 0; i < cfg.enemyCount; i++) {
      let pos: Vec;
      switch (cfg.spawnPattern) {
        case "ring": {
          const a = (i / cfg.enemyCount) * Math.PI * 2;
          pos = { x: ARENA_W / 2 + Math.cos(a) * 260, y: ARENA_H / 2 + Math.sin(a) * 200 };
          break;
        }
        case "corridor": {
          pos = { x: 60 + (i * (ARENA_W - 120)) / cfg.enemyCount, y: 80 + (i % 2) * (ARENA_H - 160) };
          break;
        }
        case "ambush": {
          pos = { x: i < cfg.enemyCount / 2 ? 60 : ARENA_W - 60, y: 80 + Math.random() * (ARENA_H - 160) };
          break;
        }
        case "swarm": {
          pos = { x: 80 + Math.random() * 80, y: 80 + Math.random() * (ARENA_H - 160) };
          break;
        }
        default:
          pos = { x: 60 + Math.random() * (ARENA_W - 120), y: 60 + Math.random() * (ARENA_H - 120) };
      }
      this.enemies.push({
        id: this.nextId++,
        pos,
        vel: { x: 0, y: 0 },
        hp: cfg.enemyHp,
        maxHp: cfg.enemyHp,
        speed: cfg.enemySpeed,
        radius: 12,
        shielded: cfg.hazards.includes("shield_drone") && i % 3 === 0,
        hitFlash: 0,
      });
    }
  }

  private spawnHazards(cfg: LevelConfig) {
    for (const h of cfg.hazards) {
      if (h === "laser") {
        for (let i = 0; i < 3; i++) {
          this.hazards.push({
            kind: "laser",
            x: 100 + i * 260,
            y: 80,
            w: 14,
            h: ARENA_H - 160,
            phase: i * 0.6,
            period: 2.2,
          });
        }
      } else if (h === "conveyor") {
        this.hazards.push({ kind: "conveyor", x: 80, y: ARENA_H / 2 - 40, w: ARENA_W - 160, h: 80, vx: 120, vy: 0 });
      } else if (h === "phase") {
        for (let i = 0; i < 4; i++) {
          this.hazards.push({
            kind: "phase",
            x: 150 + i * 160,
            y: 200 + (i % 2) * 160,
            w: 80,
            h: 80,
            phase: i * 0.4,
            period: 2.6,
          });
        }
      } else if (h === "stun_pylon") {
        for (let i = 0; i < 3; i++) {
          this.hazards.push({
            kind: "stun_pylon",
            x: 200 + i * 220,
            y: 120 + (i % 2) * 360,
            r: 80,
            cooldown: 0,
            charge: 1 + i * 0.5,
          });
        }
      } else if (h === "anti_dash") {
        for (let i = 0; i < 4; i++) {
          this.hazards.push({
            kind: "anti_dash",
            x: 180 + (i % 2) * 540,
            y: 150 + Math.floor(i / 2) * 300,
            r: 60,
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
    if (idx >= 0) {
      this.buffer.splice(idx, 1);
      return true;
    }
    return false;
  }

  private input(): Vec {
    let x = 0;
    let y = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    const len = Math.hypot(x, y);
    if (len > 0) return { x: x / len, y: y / len };
    return { x: 0, y: 0 };
  }

  // virtual joystick input (for touch)
  virtualMove: Vec = { x: 0, y: 0 };

  update(dt: number) {
    if (this.dead || this.cleared) return;
    this.elapsed += dt;
    // prune buffer
    this.buffer = this.buffer.filter((b) => this.elapsed - b.t < INPUT_BUFFER_TIME);

    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateHazards(dt);
    this.updateParticles(dt);
    this.checkCollisions();

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);

    // win/lose
    if (this.player.hp <= 0 && !this.dead) {
      this.dead = true;
      this.shake = 14;
      this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#ff3b6b", 40);
      this.onEvent({ type: "death" });
    }
    const aliveEnemies = this.enemies.length;
    if (aliveEnemies === 0 && !this.cleared) {
      this.cleared = true;
      const metrics = this.snapshotMetrics(true);
      this.onEvent({ type: "level_cleared", metrics });
    }
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

    // squash/stretch lerp toward 1
    p.scaleX += (1 - p.scaleX) * Math.min(1, dt * 8);
    p.scaleY += (1 - p.scaleY) * Math.min(1, dt * 8);

    // movement
    const move = this.input();
    const total = { x: move.x + this.virtualMove.x, y: move.y + this.virtualMove.y };
    const tlen = Math.hypot(total.x, total.y);
    const dir = tlen > 1 ? { x: total.x / tlen, y: total.y / tlen } : total;

    if (p.dashTime > 0) {
      // dash takes over velocity
    } else if (p.stunned > 0) {
      p.vel.x = lerp(p.vel.x, 0, dt * PLAYER_FRICTION);
      p.vel.y = lerp(p.vel.y, 0, dt * PLAYER_FRICTION);
    } else if (dir.x !== 0 || dir.y !== 0) {
      const targetVx = dir.x * PLAYER_MAX_SPEED;
      const targetVy = dir.y * PLAYER_MAX_SPEED;
      p.vel.x = lerp(p.vel.x, targetVx, dt * PLAYER_ACCEL);
      p.vel.y = lerp(p.vel.y, targetVy, dt * PLAYER_ACCEL);
      p.facing = dir;
      // stretch in move direction
      p.scaleX = 1 + Math.abs(dir.x) * 0.18;
      p.scaleY = 1 + Math.abs(dir.y) * 0.18;
    } else {
      p.vel.x = lerp(p.vel.x, 0, dt * PLAYER_FRICTION);
      p.vel.y = lerp(p.vel.y, 0, dt * PLAYER_FRICTION);
    }

    // try buffered dash
    if (p.dashCd === 0 && p.stunned === 0 && this.consumeBuffer("dash")) {
      const d = dir.x === 0 && dir.y === 0 ? p.facing : dir;
      const dlen = Math.hypot(d.x, d.y) || 1;
      p.vel.x = (d.x / dlen) * DASH_SPEED;
      p.vel.y = (d.y / dlen) * DASH_SPEED;
      p.dashTime = DASH_DURATION;
      p.dashCd = DASH_CD;
      p.iFrames = DASH_IFRAMES;
      p.scaleX = 1.5;
      p.scaleY = 0.6;
      this.m.dashCount++;
      this.lastDashKilled = false;
      // trail
      for (let i = 0; i < 8; i++) {
        this.particles.push({
          pos: { x: p.pos.x, y: p.pos.y },
          vel: { x: -p.vel.x * 0.2 + (Math.random() - 0.5) * 40, y: -p.vel.y * 0.2 + (Math.random() - 0.5) * 40 },
          life: 0.35,
          maxLife: 0.35,
          color: "#00f0ff",
          size: 4 + Math.random() * 3,
        });
      }
    }

    // try buffered shoot
    if (p.shootCd === 0 && p.stunned === 0 && this.consumeBuffer("shoot")) {
      const aim = this.aimDir();
      this.bullets.push({
        pos: { x: p.pos.x, y: p.pos.y },
        vel: { x: aim.x * BULLET_SPEED, y: aim.y * BULLET_SPEED },
        life: 1.2,
        fromPlayer: true,
      });
      p.shootCd = SHOOT_CD;
      p.facing = aim;
      this.m.shotsFired++;
      p.scaleX = 1.3;
      p.scaleY = 0.85;
    }

    // continuous fire if pointer held
    if (this.pointerDown && p.shootCd === 0 && p.stunned === 0) {
      this.pressAction("shoot");
    }

    // apply velocity
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    if (p.pos.x < PLAYER_RADIUS) { p.pos.x = PLAYER_RADIUS; p.scaleX = 0.6; p.scaleY = 1.4; }
    if (p.pos.x > ARENA_W - PLAYER_RADIUS) { p.pos.x = ARENA_W - PLAYER_RADIUS; p.scaleX = 0.6; p.scaleY = 1.4; }
    if (p.pos.y < PLAYER_RADIUS) { p.pos.y = PLAYER_RADIUS; p.scaleY = 0.6; p.scaleX = 1.4; }
    if (p.pos.y > ARENA_H - PLAYER_RADIUS) { p.pos.y = ARENA_H - PLAYER_RADIUS; p.scaleY = 0.6; p.scaleX = 1.4; }
  }

  private aimDir(): Vec {
    const dx = this.pointer.x - this.player.pos.x;
    const dy = this.pointer.y - this.player.pos.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return this.player.facing;
    return { x: dx / len, y: dy / len };
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.isBoss) {
        // boss AI: telegraph -> attack
        e.telegraph = (e.telegraph ?? 0) - dt;
        // drift toward arena top, predict shot
        const tx = ARENA_W / 2;
        const ty = 160;
        const dx = tx - e.pos.x;
        const dy = ty - e.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        e.vel.x = (dx / d) * e.speed * 0.6;
        e.vel.y = (dy / d) * e.speed * 0.6;
        e.pos.x += e.vel.x * dt;
        e.pos.y += e.vel.y * dt;
        if ((e.telegraph ?? 0) <= 0) {
          // fire predictive shots
          const aim =
            e.attackKind === "predict"
              ? predictAim(e.pos, this.player.pos, this.player.vel, 480)
              : sub(this.player.pos, e.pos);
          const alen = Math.hypot(aim.x, aim.y) || 1;
          for (let k = -1; k <= 1; k++) {
            const ang = Math.atan2(aim.y, aim.x) + k * 0.18;
            this.bullets.push({
              pos: { x: e.pos.x, y: e.pos.y },
              vel: { x: Math.cos(ang) * 360, y: Math.sin(ang) * 360 },
              life: 2,
              fromPlayer: false,
            });
          }
          e.telegraph = 1.6;
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
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;
    }
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.life -= dt;
    }
    this.bullets = this.bullets.filter(
      (b) => b.life > 0 && b.pos.x > -10 && b.pos.x < ARENA_W + 10 && b.pos.y > -10 && b.pos.y < ARENA_H + 10,
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
            this.player.vel.x = 0;
            this.player.vel.y = 0;
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
    return t > 0.55; // fires for ~45% of cycle
  }
  private phaseSolid(h: Extract<Hazard, { kind: "phase" }>) {
    const t = (h.phase % h.period) / h.period;
    return t < 0.6;
  }

  private checkCollisions() {
    const p = this.player;
    // player bullets hit enemies
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
          if (e.hp <= 0) {
            this.m.killsByShot++;
            this.killEnemy(e);
          }
          break;
        }
      }
    }
    // enemy bullets hit player
    for (const b of this.bullets) {
      if (b.fromPlayer) continue;
      const dx = b.pos.x - p.pos.x;
      const dy = b.pos.y - p.pos.y;
      if (Math.hypot(dx, dy) < PLAYER_RADIUS + 4) {
        b.life = 0;
        if (p.iFrames === 0) this.damagePlayer(8);
      }
    }
    // enemy body collision
    for (const e of this.enemies) {
      const dx = e.pos.x - p.pos.x;
      const dy = e.pos.y - p.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < e.radius + PLAYER_RADIUS) {
        if (p.dashTime > 0 && !e.shielded) {
          // dash kill
          e.hp -= 2;
          e.hitFlash = 0.15;
          this.m.damageDealt += 2;
          this.spawnExplosion(e.pos.x, e.pos.y, "#00f0ff", 14);
          if (e.hp <= 0) {
            this.m.killsByDash++;
            this.lastDashKilled = true;
            this.killEnemy(e);
          }
        } else if (p.iFrames === 0) {
          this.damagePlayer(e.isBoss ? 18 : 12);
        }
      }
    }
    // lasers
    for (const h of this.hazards) {
      if (h.kind === "laser" && this.laserActive(h)) {
        if (
          p.pos.x > h.x - PLAYER_RADIUS &&
          p.pos.x < h.x + h.w + PLAYER_RADIUS &&
          p.pos.y > h.y &&
          p.pos.y < h.y + h.h
        ) {
          if (p.iFrames === 0) this.damagePlayer(20);
        }
      }
      if (h.kind === "phase" && this.phaseSolid(h)) {
        // solid platform - blocks player (push out)
        if (
          p.pos.x > h.x - PLAYER_RADIUS &&
          p.pos.x < h.x + h.w + PLAYER_RADIUS &&
          p.pos.y > h.y - PLAYER_RADIUS &&
          p.pos.y < h.y + h.h + PLAYER_RADIUS
        ) {
          // push out shortest axis
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
    this.player.scaleX = 1.5;
    this.player.scaleY = 0.6;
    this.shake = Math.max(this.shake, 8);
    this.m.damageTaken += amt;
    this.spawnExplosion(this.player.pos.x, this.player.pos.y, "#ff3b6b", 10);
  }

  private killEnemy(e: Enemy) {
    this.enemies = this.enemies.filter((x) => x.id !== e.id);
    this.spawnExplosion(e.pos.x, e.pos.y, e.isBoss ? "#ff00cc" : "#00f0ff", e.isBoss ? 40 : 14);
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
        maxLife: 0.7,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }
}

function lerp(a: number, b: number, t: number) {
  const tt = Math.min(1, Math.max(0, t));
  return a + (b - a) * tt;
}
function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}
function pointInRect(p: Vec, r: { x: number; y: number; w: number; h: number }) {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}
function predictAim(from: Vec, target: Vec, targetVel: Vec, bulletSpeed: number): Vec {
  // simple lead: estimate time to hit
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.hypot(dx, dy);
  const t = dist / bulletSpeed;
  const px = target.x + targetVel.x * t - from.x;
  const py = target.y + targetVel.y * t - from.y;
  return { x: px, y: py };
}