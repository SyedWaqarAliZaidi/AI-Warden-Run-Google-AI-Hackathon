import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createAntigravityProvider } from "./ai-gateway";

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

export const LevelConfigSchema = z.object({
  nextLevel: z.number().int().min(1).max(4),
  difficulty: z.number().min(0.5).max(2.5),
  enemyCount: z.number().int().min(1).max(20),
  enemySpeed: z.number().min(40).max(220),
  enemyHp: z.number().int().min(1).max(8),
  spawnPattern: z.enum(["scatter", "ring", "ambush", "swarm", "corridor"]),
  hazards: z
    .array(z.enum(["laser", "conveyor", "phase", "stun_pylon", "anti_dash", "shield_drone"]))
    .max(6),
  bossPhase: z.enum(["telegraph", "sweep", "rush", "predict"]).optional(),
  taunt: z.string().max(160),
  reasoning: z.array(z.string().max(180)).min(2).max(6),
  groupPlan: z
    .object({
      groupCount: z.number().int().min(1).max(6),
      groupSizes: z.array(z.number().int().min(2).max(20)).min(1).max(6),
      weights: z.object({
        slasher: z.number().min(0).max(1),
        shooter: z.number().min(0).max(1),
        shield: z.number().min(0).max(1),
        sniper: z.number().min(0).max(1),
      }),
      chestCount: z.number().int().min(0).max(8),
    })
    .optional(),
});
export type LevelConfig = z.infer<typeof LevelConfigSchema>;

// === DETERMINISTIC FALLBACKS (used if LLM fails or API Key is missing) ===
export function fallbackConfig(level: number, m: PlayerMetrics | null): LevelConfig {
  const fast = m && m.timeMs < 25000;
  const dashHeavy = m ? m.killsByDash > m.killsByShot : false;
  const baseCount = 3 + level * 2 + (fast ? 2 : 0);
  return {
    nextLevel: level as 1 | 2 | 3 | 4,
    difficulty: 1 + (level - 1) * 0.3 + (fast ? 0.2 : 0),
    enemyCount: Math.min(14, baseCount),
    enemySpeed: 60 + level * 20 + (fast ? 25 : 0),
    enemyHp: level >= 3 ? 3 : level >= 2 ? 2 : 1,
    spawnPattern:
      (["scatter", "ring", "ambush", "swarm", "corridor"] as const)[level - 1] ?? "scatter",
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
      `[Fallback] Strategy Agent: Level ${level} parameters initialized.`,
      m
        ? `[Fallback] Clear time ${(m.timeMs / 1000).toFixed(1)}s, accuracy ${(m.hitAccuracy * 100).toFixed(0)}%.`
        : "[Fallback] No prior metrics. Using baseline.",
      dashHeavy
        ? "[Fallback] Player favors Dash-Attack → deploying anti-dash pylons."
        : "[Fallback] Player favors ranged fire → deploying shield drones.",
      `[Fallback] Spawn pattern set to adaptive scatter.`,
    ],
    groupPlan:
      level === 4
        ? undefined
        : {
            groupCount: level === 1 ? 2 : level === 2 ? 3 : 4,
            groupSizes: Array(level === 1 ? 2 : level === 2 ? 3 : 4).fill(6 + level),
            weights: dashHeavy
              ? { slasher: 0.2, shooter: 0.4, shield: 0.3, sniper: 0.1 }
              : { slasher: 0.4, shooter: 0.2, shield: 0.2, sniper: 0.2 },
            chestCount: 3 + level,
          },
  };
}

export function fallbackReferee(m: PlayerMetrics): {
  valid: boolean;
  legitimacyScore: number;
  reasons: string[];
  reasoning: string[];
} {
  const reasons: string[] = [];
  if (m.timeMs < 1000) reasons.push("Clear time implausibly short.");
  if (m.shotsFired === 0 && m.killsByShot > 0) reasons.push("Shot kills without shots fired.");
  if (m.dashCount === 0 && m.killsByDash > 0) reasons.push("Dash kills without dashes.");
  if (m.hpRemaining > 100) reasons.push("HP exceeds maximum.");

  const score = reasons.length === 0 ? 100 : Math.max(0, 100 - reasons.length * 35);
  return {
    valid: reasons.length === 0,
    legitimacyScore: score,
    reasons: reasons.length === 0 ? ["Clear run validated."] : reasons,
    reasoning: [
      `[Fallback] Referee Agent checking run legitimacy.`,
      `[Fallback] Metric check: Time=${(m.timeMs / 1000).toFixed(1)}s, HP Remaining=${m.hpRemaining}%, Accuracy=${(m.hitAccuracy * 100).toFixed(0)}%.`,
      reasons.length === 0
        ? `[Fallback] Score: 100/100. Run completely legitimate.`
        : `[Fallback] Score: ${score}/100. Suspicious activity detected: ${reasons.join(", ")}`,
    ],
  };
}

// === AGENT 1: WARDEN STRATEGY AGENT ===
export const requestStrategyAgent = createServerFn({ method: "POST" })
  .inputValidator((input: { level: number; metrics: PlayerMetrics | null }) => input)
  .handler(async ({ data }): Promise<Omit<LevelConfig, "taunt">> => {
    const apiKey = process.env.ANTIGRAVITY_API_KEY;
    if (!apiKey) {
      console.warn("ANTIGRAVITY_API_KEY not set. Using Strategy Agent fallback.");
      const full = fallbackConfig(data.level, data.metrics);
      const { taunt, ...strategyOnly } = full;
      return strategyOnly;
    }

    try {
      const provider = createAntigravityProvider(apiKey);
      const model = provider("gemini-1.5-pro");

      const system = `You are the WARDEN Strategy Agent, the tactical brain of an adaptive security AI.
Your job is to analyze Aegis's metrics and configure the next level's difficulty, enemy properties, spawn pattern, hazards, and groups.
Do NOT include a 'taunt' field. The narrative agent handles the taunt.
Analyze the player metrics to counter their strategy:
- High accuracy/damage: Increase enemy HP/Count.
- Dash heavy player: Add anti_dash / stun_pylon hazards.
- Ranged/Shot heavy player: Add shield_drone / laser hazards.
- Fast runs: Boost enemyCount and speed.
Output a JSON object adhering exactly to the schema. Include a 'reasoning' array containing 2 to 5 highly tactical statements about your calculations.`;

      const prompt = `Level to orchestrate: ${data.level}.
Previous level metrics (null if first level):
${JSON.stringify(data.metrics, null, 2)}`;

      const StrategySchema = LevelConfigSchema.omit({ taunt: true });
      const { experimental_output } = await generateText({
        model,
        system,
        prompt,
        experimental_output: Output.object({ schema: StrategySchema }),
      });

      return {
        ...experimental_output,
        nextLevel: data.level as 1 | 2 | 3 | 4,
      };
    } catch (err) {
      console.error("Strategy Agent error, using fallback:", err);
      const full = fallbackConfig(data.level, data.metrics);
      const { taunt, ...strategyOnly } = full;
      return strategyOnly;
    }
  });

// === AGENT 2: NARRATIVE AGENT ===
export const requestNarrativeAgent = createServerFn({ method: "POST" })
  .inputValidator((input: { level: number; metrics: PlayerMetrics | null }) => input)
  .handler(async ({ data }): Promise<{ taunt: string; reasoning: string[] }> => {
    const apiKey = process.env.ANTIGRAVITY_API_KEY;
    if (!apiKey) {
      console.warn("ANTIGRAVITY_API_KEY not set. Using Narrative Agent fallback.");
      const full = fallbackConfig(data.level, data.metrics);
      return {
        taunt: full.taunt,
        reasoning: [
          `[Fallback] Narrative Agent generating taunt for level ${data.level}.`,
          `[Fallback] Aegis current state analysed. System ready.`,
        ],
      };
    }

    try {
      const provider = createAntigravityProvider(apiKey);
      const model = provider("gemini-1.5-pro");

      const system = `You are the WARDEN Narrative Agent, a ruthless, theatrical security intelligence.
Your task is to craft a brief, biting cyber-dystopian taunt (maximum 160 characters) directly addressing Aegis's playstyle.
Analyze player performance:
- Did they take zero damage? Mock their futile perfection.
- Did they clear it extremely fast? Taunt them for running blindly into your trap.
- Do they dash constantly? Comment on their nervous, frantic dodging.
- Do they have poor accuracy? Laugh at their desperate, blind firing.
- If first level, make it an imposing threat.
Also generate a 'reasoning' array (2-4 steps) detailing your psychoanalytical breakdown of Aegis and why you chose this taunt.`;

      const prompt = `Level: ${data.level}.
Metrics: ${JSON.stringify(data.metrics, null, 2)}`;

      const NarrativeSchema = z.object({
        taunt: z.string().max(160),
        reasoning: z.array(z.string().max(180)).min(2).max(6),
      });

      const { experimental_output } = await generateText({
        model,
        system,
        prompt,
        experimental_output: Output.object({ schema: NarrativeSchema }),
      });

      return experimental_output;
    } catch (err) {
      console.error("Narrative Agent error, using fallback:", err);
      const full = fallbackConfig(data.level, data.metrics);
      return {
        taunt: full.taunt,
        reasoning: [
          `[Fallback] Narrative Agent error. Reverted to primary matrix.`,
          `[Fallback] Default taunt loaded: "${full.taunt}"`,
        ],
      };
    }
  });

// === AGENT 3: REFEREE AGENT ===
export const requestRefereeAgent = createServerFn({ method: "POST" })
  .inputValidator((input: { metrics: PlayerMetrics }) => ({ metrics: input.metrics }))
  .handler(
    async ({
      data,
    }): Promise<{
      valid: boolean;
      legitimacyScore: number;
      reasons: string[];
      reasoning: string[];
    }> => {
      const apiKey = process.env.ANTIGRAVITY_API_KEY;
      if (!apiKey) {
        console.warn("ANTIGRAVITY_API_KEY not set. Using Referee Agent fallback.");
        return fallbackReferee(data.metrics);
      }

      try {
        const provider = createAntigravityProvider(apiKey);
        const model = provider("gemini-1.5-pro");

        const system = `You are the WARDEN Referee Agent. Your job is to analyze the run metrics of Aegis's level clear to detect anomalies, impossible actions, or cheating.
Validate these rules:
- TimeMs: should be at least 1000ms (1 second). Any lower is impossible.
- Kills vs Actions: Aegis cannot get kills by Shot if 0 shots were fired, nor kills by Dash if dashCount is 0.
- HP: Aegis's hpRemaining cannot exceed 100.
Calculate:
1. 'valid': true if legitimate, false if any impossible metrics or anomalies are found.
2. 'legitimacyScore': An integer between 0 and 100 indicating confidence. Perfect run is 100. Anomalies reduce score.
3. 'reasons': List of specific anomalies found, or a success message if clean.
4. 'reasoning': 2 to 4 steps of analytical reasoning logging your step-by-step checks.`;

        const prompt = `Validate the following metrics:
${JSON.stringify(data.metrics, null, 2)}`;

        const RefereeSchema = z.object({
          valid: z.boolean(),
          legitimacyScore: z.number().min(0).max(100),
          reasons: z.array(z.string().max(180)),
          reasoning: z.array(z.string().max(180)).min(2).max(6),
        });

        const { experimental_output } = await generateText({
          model,
          system,
          prompt,
          experimental_output: Output.object({ schema: RefereeSchema }),
        });

        return experimental_output;
      } catch (err) {
        console.error("Referee Agent error, using fallback:", err);
        return fallbackReferee(data.metrics);
      }
    },
  );

// === COHESIVE ORCHESTRATOR ===
export const requestWardenConfig = createServerFn({ method: "POST" })
  .inputValidator((input: { level: number; metrics: PlayerMetrics | null }) => input)
  .handler(
    async ({
      data,
    }): Promise<
      LevelConfig & {
        strategyReasoning: string[];
        narrativeReasoning: string[];
      }
    > => {
      // Run Strategy and Narrative Agents in parallel to configure the level
      const [strategy, narrative] = await Promise.all([
        requestStrategyAgent({ data }),
        requestNarrativeAgent({ data }),
      ]);

      return {
        ...strategy,
        taunt: narrative.taunt,
        reasoning: strategy.reasoning,
        strategyReasoning: strategy.reasoning,
        narrativeReasoning: narrative.reasoning,
      };
    },
  );

// === COMPATIBILITY WRAPPER ===
export const validateRun = createServerFn({ method: "POST" })
  .inputValidator((input: { metrics: PlayerMetrics }) => ({ metrics: input.metrics }))
  .handler(async ({ data }) => {
    return requestRefereeAgent({ data });
  });
