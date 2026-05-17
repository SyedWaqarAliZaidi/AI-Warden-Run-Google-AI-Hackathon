export type Vec = { x: number; y: number };

export type Hazard =
  | { kind: "laser"; x: number; y: number; w: number; h: number; phase: number; period: number }
  | { kind: "conveyor"; x: number; y: number; w: number; h: number; vx: number; vy: number }
  | { kind: "phase"; x: number; y: number; w: number; h: number; phase: number; period: number }
  | { kind: "stun_pylon"; x: number; y: number; r: number; cooldown: number; charge: number }
  | { kind: "anti_dash"; x: number; y: number; r: number };

export type Wall = {
  x: number; y: number; w: number; h: number;
  kind: "wall" | "gate"; // gate is visually different and may be locked
  locked?: boolean;
};

export type AnimState = "idle" | "run" | "dash" | "hit" | "victory" | "attack";

export type Enemy = {
  id: number;
  pos: Vec;
  vel: Vec;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  shielded: boolean;
  isBoss?: boolean;
  telegraph?: number;
  attackKind?: "sweep" | "rush" | "predict";
  hitFlash: number;
  animTime: number;
  facing: Vec;
  anim: AnimState;
  attackTimer: number; // for swinging weapon
};

export type Bullet = {
  pos: Vec;
  vel: Vec;
  life: number;
  fromPlayer: boolean;
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
  attackSwing: number; // 0..1 sword swing
};
