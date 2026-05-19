export type UpgradeId =
  | "hp"
  | "sword"
  | "bullet"
  | "capacity"
  | "freeze"
  | "grenade";

export type UpgradeDef = {
  id: UpgradeId;
  name: string;
  desc: string;
  max: number;
  /** cost(currentLevel) returns currency cost to buy the NEXT level. */
  cost: (lvl: number) => number;
  icon: string;
  color: string;
};

export const UPGRADES: UpgradeDef[] = [
  { id: "hp",       name: "Aegis Core",       desc: "+10 max HP per level (also refills).",                       max: 15, cost: (l) => 40 + l * 25,  icon: "♥", color: "#ff3b6b" },
  { id: "sword",    name: "Plasma Edge",      desc: "Dash-attack damage +1 per level (sword swing also stronger).", max: 8,  cost: (l) => 60 + l * 40,  icon: "⚔", color: "#9d4dff" },
  { id: "bullet",   name: "Bullet Forge",     desc: "Level 1 enables bullets, further levels add +1 damage.",       max: 8,  cost: (l) => 50 + l * 35,  icon: "✦", color: "#00ffaa" },
  { id: "capacity", name: "Magazine",         desc: "+4 max bullets per level (base mag = 10).",                    max: 10, cost: (l) => 30 + l * 20,  icon: "▣", color: "#00f0ff" },
  { id: "freeze",   name: "Chrono Bomb",      desc: "Carry +1 Time-Freeze charge (max 3, 5s field).",               max: 3,  cost: (l) => 90 + l * 60,  icon: "❄", color: "#88ddff" },
  { id: "grenade",  name: "Plasma Grenade",   desc: "Carry +1 Plasma Grenade charge (max 3, AoE blast).",           max: 3,  cost: (l) => 80 + l * 55,  icon: "✸", color: "#ffaa44" },
];

export type UpgradeLevels = Record<UpgradeId, number>;

export const newUpgradeLevels = (): UpgradeLevels => ({
  hp: 0, sword: 0, bullet: 0, capacity: 0, freeze: 0, grenade: 0,
});

/** Derived stats from upgrade levels. */
export function derive(u: UpgradeLevels) {
  const bulletsEnabled = u.bullet > 0;
  return {
    maxHp: 100 + u.hp * 10,
    swordBonus: u.sword,           // added to dash damage
    bulletsEnabled,
    bulletDamage: bulletsEnabled ? u.bullet : 0,  // 1..8
    magazine: 10 + u.capacity * 4,
    freezeMax: u.freeze,
    grenadeMax: u.grenade,
  };
}
