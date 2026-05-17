export type Vec = { x: number; y: number };

export type Hazard =
  | { kind: "laser"; x: number; y: number; w: number; h: number; phase: number; period: number }
  | { kind: "conveyor"; x: number; y: number; w: number; h: number; vx: number; vy: number }
  | { kind: "phase"; x: number; y: number; w: number; h: number; phase: number; period: number }
  | { kind: "stun_pylon"; x: number; y: number; r: number; cooldown: number; charge: number }
  | { kind: "anti_dash"; x: number; y: number; r: number };

export type Wall = {
  x: number; y: number; w: number; h: number;
  kind: "wall" | "gate";
  locked?: boolean;
};

export type AnimState = "idle" | "run" | "dash" | "hit" | "victory" | "attack";

export type EnemyClass = "drone" | "shooter" | "sniper" | "slasher" | "shield" | "boss";

export type Enemy = {
  id: number;
  cls: EnemyClass;
  pos: Vec;
  vel: Vec;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  hitFlash: number;
  animTime: number;
  facing: Vec;
  anim: AnimState;
  attackTimer: number;
  shootCd: number;
  dashCd: number;
  dashTime: number;
  shieldActive: boolean;        // shield class: deployed
  isBoss?: boolean;
  // boss
  bossPhase?: 1 | 2;
  stunCd?: number;
  blindCd?: number;
  spawnCd?: number;
  abilityWarn?: number;         // counts down 3->0 before stun
  abilityActiveStun?: number;
  abilityActiveBlind?: number;
  telegraph?: number;
  attackKind?: "sweep" | "rush" | "predict";
};

export type Bullet = {
  pos: Vec;
  vel: Vec;
  life: number;
  fromPlayer: boolean;
  damage?: number;
  big?: boolean;
};

export type Particle = {
  pos: Vec;
  vel: Vec;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

export type Player = {
  pos: Vec;
  vel: Vec;
  hp: number;
  maxHp: number;
  facing: Vec;
  dashCd: number;
  dashTime: number;
  iFrames: number;
  shootCd: number;
  scaleX: number;
  scaleY: number;
  stunned: number;
  animTime: number;
  anim: AnimState;
  attackSwing: number;
  healUsed: boolean;
};

export type Pickup = {
  kind: "heal";
  pos: Vec;
  r: number;
  taken: boolean;
};

export type Difficulty = "easy" | "medium" | "hard" | "nightmare";

export const DIFFICULTY_PRESETS: Record<Difficulty, {
  countMul: number; dmgMul: number; hpMul: number; label: string; color: string;
}> = {
  easy:      { countMul: 0.7, dmgMul: 0.55, hpMul: 0.7, label: "EASY",      color: "#00ffaa" },
  medium:    { countMul: 1.0, dmgMul: 1.0,  hpMul: 1.0, label: "MEDIUM",    color: "#00f0ff" },
  hard:      { countMul: 1.4, dmgMul: 1.6,  hpMul: 1.6, label: "HARD",      color: "#ffcc00" },
  nightmare: { countMul: 1.9, dmgMul: 2.4,  hpMul: 2.4, label: "NIGHTMARE", color: "#ff3b64" },
};

export const LEVEL_TIME_LIMITS: Record<number, number> = {
  1: 180,
  2: 210,
  3: 240,
  4: 270,
};
