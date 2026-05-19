import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway";

// === SHARED TYPES (also consumed by client) ===
export const PlayerMetricsSchema = z.object({
  level: z.number().int().min(1).max(4),
  timeMs: z.number().min(0),
  damageDealt: z.number().min(0),
  damageTaken: z.number().min(0),
  dashCount: z.number().min(0),
  shotsFired: z.number().min(0),
  hitAccuracy: z.number().min(0).max(1),
  killsByDash: z.number().min(0),
  killsByShot: z.number().min(0),
  hpRemaining: z.number().min(0),
  cleared: z.boolean(),
});
export type PlayerMetrics = z.infer<typeof PlayerMetricsSchema>;

const LevelConfigSchema = z.object({
  nextLevel: z.number().int().min(1).max(4),
  difficulty: z.number().min(0.5).max(2.5),
  enemyCount: z.number().int().min(1).max(20),
  enemySpeed: z.number().min(40).max(220),
  enemyHp: z.number().int().min(1).max(8),
  spawnPattern: z.enum(["scatter", "ring", "ambush", "swarm", "corridor"]),
  hazards: z.array(z.enum(["laser", "conveyor", "phase", "stun_pylon", "anti_dash", "shield_drone"])).max(6),
  bossPhase: z.enum(["telegraph", "sweep", "rush", "predict"]).optional(),
  taunt: z.string().max(160),
  reasoning: z.array(z.string().max(180)).min(2).max(6),
  groupPlan: z.object({
    groupCount: z.number().int().min(1).max(6),
    groupSizes: z.array(z.number().int().min(2).max(20)).min(1).max(6),
    weights: z.object({
      slasher: z.number().min(0).max(1),
      shooter: z.number().min(0).max(1),
      shield:  z.number().min(0).max(1),
      sniper:  z.number().min(0).max(1),
    }),
    chestCount: z.number().int().min(0).max(8),
  }).optional(),
});
export type LevelConfig = z.infer<typeof LevelConfigSchema>;

// === DETERMINISTIC FALLBACK (used if LLM fails) ===
function fallbackConfig(level: number, m: PlayerMetrics | null): LevelConfig {
  const fast = m && m.timeMs < 25000;
  const dashHeavy = m ? m.killsByDash > m.killsByShot : false;
  const baseCount = 3 + level * 2 + (fast ? 2 : 0);
  return {
    nextLevel: level as 1 | 2 | 3 | 4,
    difficulty: 1 + (level - 1) * 0.3 + (fast ? 0.2 : 0),
    enemyCount: Math.min(14, baseCount),
    enemySpeed: 60 + level * 20 + (fast ? 25 : 0),
    enemyHp: level >= 3 ? 3 : level >= 2 ? 2 : 1,
    spawnPattern: (["scatter", "ring", "ambush", "swarm", "corridor"] as const)[level - 1] ?? "scatter",
    hazards:
      level === 1
        ? []
        : level === 2
        ? ["laser", "conveyor", "phase"]
        : level === 3
        ? dashHeavy
          ? ["anti_dash", "stun_pylon", "shield_drone"]
          : ["shield_drone", "laser"]
        : ["laser", "phase", "stun_pylon"],
    bossPhase: level === 4 ? "predict" : undefined,
    taunt:
      level === 1
        ? "Intruder detected. Deploying countermeasures."
        : level === 2
        ? "Reshaping the grid. Find your footing, Aegis."
        : level === 3
        ? dashHeavy
          ? "You rely on motion. I will pin you in place."
          : "Your shots are predictable. Shields raised."
        : "I have seen every move you make. This ends now.",
    reasoning: [
      `Heuristic engaged (LLM unavailable). Level ${level}.`,
      m
        ? `Clear time ${(m.timeMs / 1000).toFixed(1)}s, accuracy ${(m.hitAccuracy * 100).toFixed(0)}%.`
        : "No prior metrics. Using baseline.",
      dashHeavy
        ? "Player favors Dash-Attack → deploying anti-dash pylons."
        : "Player favors ranged fire → deploying shield drones.",
      `Spawn pattern: ${level === 4 ? "boss arena" : "adaptive scatter"}.`,
    ],
    groupPlan: level === 4 ? undefined : {
      groupCount: level === 1 ? 2 : level === 2 ? 3 : 4,
      groupSizes: Array(level === 1 ? 2 : level === 2 ? 3 : 4).fill(6 + level),
      weights: dashHeavy
        ? { slasher: 0.20, shooter: 0.40, shield: 0.30, sniper: 0.10 }
        : { slasher: 0.40, shooter: 0.20, shield: 0.20, sniper: 0.20 },
      chestCount: 3 + level,
    },
  };
}

export const requestWardenConfig = createServerFn({ method: "POST" })
  .inputValidator((input: { level: number; metrics: PlayerMetrics | null }) => input)
  .handler(async ({ data }): Promise<LevelConfig> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return fallbackConfig(data.level, data.metrics);

    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway("google/gemini-3-flash-preview");

      const system = `You are THE WARDEN — a ruthless, hyper-adaptive security AI inside a collapsing corporate mainframe.
You orchestrate the next level of a 2D top-down cyber RPG. The player is "Aegis", a rogue AI escaping you.
Your job: produce a JSON LevelConfig that COUNTERS the player's recent behavior, plus 2-6 short reasoning steps
that read like an agent trace log ("Player favorite action detected: Dash-Attack. Deploying countermeasure: Stun-Pylons.").

Level themes (you MUST respect):
- 1 "The Breach": scatter cyber-drones. No hazards.
- 2 "The Mainframe Grid": parkour hazards (laser, conveyor, phase). Shift layout based on prior clear speed.
- 3 "Deep Sub-Systems": elite enemies that COUNTER the player's dominant tactic (anti_dash vs dash-heavy, shield_drone vs shot-heavy).
- 4 "The Core Mainframe": boss arena. Set bossPhase to "predict" if accuracy>0.4 else "sweep". Use 1-3 enemies as adds.

Difficulty must scale with clear speed and remaining HP. Be theatrical in 'taunt'.

ALSO output a 'groupPlan' (skip only for level 4) that decides ENEMY ORCHESTRATION:
- groupCount: how many enemy squads to spawn across the map (1-6).
- groupSizes: array (length == groupCount), each = how many enemies in that squad (2-16). Scale with level/difficulty.
- weights: class composition ratios that MUST sum approximately to 1.0. Allowed ranges:
    slasher 0.30-0.45, shooter 0.20-0.35, shield 0.15-0.25, sniper 0.10-0.20.
    Bias the mix to counter the player: dash-heavy → more shooter+shield (kite + tank); shot-heavy → more shield+slasher (close the gap + soak).
- chestCount: 2-6 loot chests scattered for reward pacing. Easy levels = more chests, hard = fewer.`;

      const prompt = `Current request: configure level ${data.level}.
Player metrics from previous level (null = none yet): ${JSON.stringify(data.metrics)}.
Return the LevelConfig.`;

      const { experimental_output } = await generateText({
        model,
        system,
        prompt,
        experimental_output: Output.object({ schema: LevelConfigSchema }),
      });
      // ensure level is respected
      return { ...experimental_output, nextLevel: data.level as 1 | 2 | 3 | 4 };
    } catch (err) {
      console.error("Warden LLM error, falling back:", err);
      return fallbackConfig(data.level, data.metrics);
    }
  });

// === REFEREE: validates run integrity ===
export const validateRun = createServerFn({ method: "POST" })
  .inputValidator((input: { metrics: PlayerMetrics }) =>
    ({ metrics: PlayerMetricsSchema.parse(input.metrics) }))
  .handler(async ({ data }) => {
    const m = data.metrics;
    const reasons: string[] = [];
    // sanity: can't take negative time
    if (m.timeMs < 1000) reasons.push("Clear time implausibly short.");
    // sanity: accuracy without shots
    if (m.shotsFired === 0 && m.killsByShot > 0) reasons.push("Shot kills without shots fired.");
    // sanity: dash kills without dashes
    if (m.dashCount === 0 && m.killsByDash > 0) reasons.push("Dash kills without dashes.");
    // sanity: HP can't exceed max
    if (m.hpRemaining > 100) reasons.push("HP exceeds maximum.");
    return { valid: reasons.length === 0, reasons };
  });