import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GameEngine, VIEW_W, VIEW_H, type GameEvent } from "@/game/engine";
import { render } from "@/game/render";
import { DIFFICULTY_PRESETS, LEVEL_TIME_LIMITS, type Difficulty } from "@/game/types";
import { audio } from "@/lib/audio";
import { UPGRADES, derive, type UpgradeId } from "@/game/upgrades";
import {
  requestWardenConfig,
  validateRun,
  type LevelConfig,
  type PlayerMetrics,
} from "@/lib/warden.functions";
import { AgentTracePanel, type TraceEntry } from "./AgentTracePanel";

type Phase = "menu" | "loading" | "playing" | "between" | "won" | "lost";

type TraceLine = { id: number; msg: string; kind: "trace" | "taunt" | "system" };

const LEVEL_NAMES: Record<number, string> = {
  1: "L1 — The Breach",
  2: "L2 — The Mainframe Grid",
  3: "L3 — Deep Sub-Systems",
  4: "L4 — The Core Mainframe",
};

export function WardenGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [countdown, setCountdown] = useState(0);
  const [timeLeft, setTimeLeft] = useState(180);
  const [engineState, setEngineState] = useState<"countdown" | "playing" | "victory" | "dead">("countdown");
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [lastMetrics, setLastMetrics] = useState<PlayerMetrics | null>(null);
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [refereeMsg, setRefereeMsg] = useState<string | null>(null);
  const [bossPhase, setBossPhase] = useState<1 | 2>(1);
  const [blindActive, setBlindActive] = useState(false);
  const [stunWarn, setStunWarn] = useState(0);
  const [healUsed, setHealUsed] = useState(false);
  const [deathReason, setDeathReason] = useState<string | null>(null);
  const [currency, setCurrency] = useState(0);
  const [ammo, setAmmo] = useState(10);
  const [magazine, setMagazine] = useState(10);
  const [reloading, setReloading] = useState(0);
  const [freezeCharges, setFreezeCharges] = useState(0);
  const [grenadeCharges, setGrenadeCharges] = useState(0);
  const [freezeActive, setFreezeActive] = useState(false);
  const [upgradesVer, setUpgradesVer] = useState(0); // bump to re-render shop
  const traceIdRef = useRef(0);

  const [agentTraces, setAgentTraces] = useState<TraceEntry[]>([]);

  const pushAgentTrace = useCallback((agent: TraceEntry["agent"], action: string, decision: string, reasoning: string[], isThinking = false) => {
    setAgentTraces((prev) => {
      const timestamp = new Date().toLocaleTimeString();
      const id = `${agent}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const filtered = prev.filter(t => !(t.agent === agent && t.isThinking));
      return [
        { id, agent, action, decision, reasoning, timestamp, isThinking },
        ...filtered
      ].slice(0, 50);
    });
  }, []);

  const callWarden = useServerFn(requestWardenConfig);
  const callReferee = useServerFn(validateRun);

  const pushTrace = useCallback((msg: string, kind: TraceLine["kind"] = "trace") => {
    setTrace((t) => {
      const next = [...t, { id: ++traceIdRef.current, msg, kind }];
      return next.slice(-40);
    });
  }, []);

  useEffect(() => {
    if (engineRef.current) return;
    const g = new GameEngine();
    g.onEvent = (e: GameEvent) => {
      if (e.type === "trace") pushTrace(e.msg, "trace");
      else if (e.type === "warden_taunt") pushTrace(`THE WARDEN: "${e.msg}"`, "taunt");
      else if (e.type === "level_cleared") handleLevelCleared(e.metrics);
      else if (e.type === "death") handleDeath(e.reason);
    };
    engineRef.current = g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = engineRef.current;
      const ctx = canvasRef.current?.getContext("2d");
      if (g && ctx) {
        if (phase === "playing") {
          g.update(dt);
          setEngineState(g.state);
          setCountdown(g.countdown);
          setTimeLeft(g.timeLeft);
          setHp(Math.round(g.player.hp));
          setMaxHp(g.player.maxHp);
          setHealUsed(g.player.healUsed);
          setBlindActive(g.blindActive > 0);
          setStunWarn(g.stunWarn);
          setCurrency(g.currency);
          setAmmo(g.ammo);
          setMagazine(derive(g.upgrades).magazine);
          setReloading(g.reloading);
          setFreezeCharges(g.freezeCharges);
          setGrenadeCharges(g.grenadeCharges);
          setFreezeActive(g.freezeActive > 0);
          const boss = g.enemies.find((e) => e.isBoss);
          if (boss) setBossPhase((boss.bossPhase ?? 1) as 1 | 2);
        }
        render(ctx, g);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    const g = engineRef.current;
    if (!g) return;
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," ","q","e","r"].includes(k)) e.preventDefault();
      if (k === " " || k === "shift") g.pressAction("dash");
      else if (k === "q") g.pressAction("freeze");
      else if (k === "e") g.pressAction("grenade");
      else if (k === "r") g.pressAction("reload");
      else g.keys.add(k);
    };
    const onUp = (e: KeyboardEvent) => g.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = engineRef.current;
    const canvas = canvasRef.current;
    if (!g || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    g.pointer.x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    g.pointer.y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
  };
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    handlePointer(e);
    const g = engineRef.current;
    if (!g) return;
    g.pointerDown = true;
    g.pressAction("shoot");
  };
  const handlePointerUp = () => {
    const g = engineRef.current;
    if (g) g.pointerDown = false;
  };

  const startLevel = useCallback(
    async (lvl: number, prevMetrics: PlayerMetrics | null) => {
      setPhase("loading");
      setDeathReason(null);
      pushTrace(`Warden orchestrating Level ${lvl} on ${difficulty.toUpperCase()}…`, "system");
      
      // Trigger thinking state for Strategy and Narrative Agents
      pushAgentTrace("strategy", "Orchestrating level parameters & class balancing", "Running tactical simulation...", [], true);
      pushAgentTrace("narrative", "Evaluating Aegis performance & selecting taunt vector", "Analyzing psychological telemetry...", [], true);

      try {
        const cfg = await callWarden({ data: { level: lvl, metrics: prevMetrics } });
        
        // Resolve Strategy Agent Trace
        pushAgentTrace(
          "strategy",
          `Level ${lvl} Strategy Configuration`,
          `Difficulty: ${cfg.difficulty.toFixed(2)} | Enemies: ${cfg.enemyCount} (Hp:${cfg.enemyHp}, Spd:${cfg.enemySpeed}) | Spawn: ${cfg.spawnPattern.toUpperCase()}`,
          cfg.strategyReasoning || cfg.reasoning || []
        );

        // Resolve Narrative Agent Trace
        pushAgentTrace(
          "narrative",
          `Synthesizing Taunt for Aegis`,
          `Taunt Selected: "${cfg.taunt}"`,
          cfg.narrativeReasoning || []
        );

        setConfig(cfg);
        setCurrentLevel(lvl);
        const g = engineRef.current!;
        g.setDifficulty(difficulty);
        g.loadLevel(cfg);
        setHp(g.player.hp);
        setMaxHp(g.player.maxHp);
        setTimeLeft(g.timeLeft);
        setBossPhase(1);
        setPhase("playing");
      } catch (err) {
        pushTrace(`Warden unreachable: ${(err as Error).message}`, "system");
        setAgentTraces(prev => prev.filter(t => !t.isThinking));
        setPhase("menu");
      }
    },
    [callWarden, pushTrace, difficulty, pushAgentTrace],
  );

  const handleLevelCleared = async (metrics: PlayerMetrics) => {
    setLastMetrics(metrics);
    setPhase("between");
    pushTrace(
      `Level ${metrics.level} cleared in ${(metrics.timeMs / 1000).toFixed(1)}s — acc ${(metrics.hitAccuracy * 100).toFixed(0)}%`,
      "system",
    );

    // Trigger thinking state for Referee Agent
    pushAgentTrace("referee", `Auditing Aegis telemetry for Level ${metrics.level}`, "Performing standard safety analysis...", [], true);

    try {
      const v = await callReferee({ data: { metrics } });
      
      // Resolve Referee Agent Trace
      pushAgentTrace(
        "referee",
        `Level ${metrics.level} Audit Complete`,
        v.valid 
          ? `Run verified legitimate (Score: ${v.legitimacyScore || 100}/100)` 
          : `Security flag raised (Score: ${v.legitimacyScore || 0}/100)`,
        [
          `Legitimacy verdict: ${v.valid ? "VALID" : "FLAGGED ANOMALY"}`,
          ...(v.reasons || []),
          ...(v.reasoning || [])
        ]
      );

      if (!v.valid) {
        setRefereeMsg(`Referee flagged: ${v.reasons.join(", ")}`);
        pushTrace(`REFEREE: invalid run — ${v.reasons.join(", ")}`, "system");
      } else {
        setRefereeMsg(null);
        pushTrace("REFEREE: run validated ✓", "system");
      }
    } catch (err) {
      setAgentTraces(prev => prev.filter(t => !t.isThinking));
      pushTrace(`Referee unreachable: ${(err as Error).message}`, "system");
    }
    if (metrics.level >= 4) setPhase("won");
  };

  const handleDeath = (reason?: string) => {
    setPhase("lost");
    if (reason) setDeathReason(reason);
    pushTrace(reason ?? "Aegis terminated. The Warden prevails.", "system");
  };

  const begin = () => {
    audio.ensure(); audio.resume(); audio.play("menu");
    setTrace([]);
    setLastMetrics(null);
    setRefereeMsg(null);
    setDeathReason(null);
    // Fresh run: reset progression
    if (engineRef.current) {
      engineRef.current.currency = 0;
      engineRef.current.upgrades = { hp: 0, sword: 0, bullet: 0, capacity: 0, freeze: 0, grenade: 0 };
    }
    setUpgradesVer((v) => v + 1);
    startLevel(1, null);
  };
  const nextLevel = () => { if (lastMetrics) startLevel(lastMetrics.level + 1, lastMetrics); };
  const retry = () => {
    setTrace([]);
    setLastMetrics(null);
    setDeathReason(null);
    startLevel(currentLevel, lastMetrics);
  };

  // mobile joystick
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyActive = useRef(false);
  const joyCenter = useRef({ x: 0, y: 0 });
  const onJoyStart = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    joyCenter.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    joyActive.current = true;
    onJoyMove(e);
  };
  const onJoyMove = (e: React.PointerEvent) => {
    if (!joyActive.current || !engineRef.current) return;
    const dx = e.clientX - joyCenter.current.x;
    const dy = e.clientY - joyCenter.current.y;
    const m = Math.min(1, Math.hypot(dx, dy) / 50);
    const a = Math.atan2(dy, dx);
    engineRef.current.virtualMove = { x: Math.cos(a) * m, y: Math.sin(a) * m };
  };
  const onJoyEnd = () => {
    joyActive.current = false;
    if (engineRef.current) engineRef.current.virtualMove = { x: 0, y: 0 };
  };

  const hpPct = (hp / maxHp) * 100;
  const hpColor = hp > maxHp * 0.5 ? "#00f0ff" : hp > maxHp * 0.25 ? "#ffcc00" : "#ff3b64";
  const timeStr = formatTime(timeLeft);
  const timeUrgent = timeLeft < 30;
  const diffPreset = DIFFICULTY_PRESETS[difficulty];

  return (
    <div className="min-h-screen w-full bg-[#05060e] text-cyan-100 font-mono">
      <header className="border-b border-cyan-500/30 px-4 py-3 flex items-center justify-between bg-gradient-to-r from-[#05060e] via-[#0a0f24] to-[#05060e]">
        <h1 className="text-xl tracking-[0.3em] text-cyan-300" style={{ textShadow: "0 0 12px #00f0ff" }}>
          THE WARDEN&apos;S LABYRINTH
        </h1>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-cyan-400/70">{LEVEL_NAMES[currentLevel]}</span>
          <span
            className="px-2 py-0.5 rounded border tracking-widest"
            style={{ borderColor: diffPreset.color, color: diffPreset.color, boxShadow: `0 0 10px ${diffPreset.color}55` }}
          >
            {diffPreset.label}
          </span>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-[1400px] mx-auto">
        <div className="flex-1 relative">
          <div className="relative w-full" style={{ maxWidth: VIEW_W }}>
            <canvas
              ref={canvasRef}
              width={VIEW_W}
              height={VIEW_H}
              onPointerMove={handlePointer}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full h-auto border border-cyan-500/40 rounded-md touch-none"
              style={{ boxShadow: "0 0 40px rgba(0,240,255,0.15)" }}
            />

            {/* ===== Enhanced HUD ===== */}
            {/* HP block top-left */}
            <div className="absolute top-3 left-3 pointer-events-none select-none">
              <div className="relative bg-[#04060e]/85 border border-cyan-500/50 rounded-md px-3 py-2 backdrop-blur-sm"
                   style={{ boxShadow: "0 0 20px rgba(0,240,255,0.25), inset 0 0 12px rgba(0,240,255,0.08)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: hpColor, boxShadow: `0 0 6px ${hpColor}` }} />
                  <span className="text-[10px] tracking-[0.3em] text-cyan-300">AEGIS CORE</span>
                  <span className="ml-auto text-[10px] tracking-widest text-cyan-400/70">
                    {hp}<span className="text-cyan-500/50">/{maxHp}</span>
                  </span>
                </div>
                {/* segmented HP */}
                <div className="relative w-[260px] h-3 bg-cyan-950/70 border border-cyan-500/40 rounded-sm overflow-hidden">
                  <div className="absolute inset-y-0 left-0 transition-all duration-150"
                       style={{
                         width: `${hpPct}%`,
                         background: `linear-gradient(90deg, ${hpColor}, ${hpColor}aa)`,
                         boxShadow: `0 0 10px ${hpColor}, inset 0 0 6px rgba(255,255,255,0.25)`,
                       }} />
                  {/* segment ticks */}
                  {[20, 40, 60, 80].map((p) => (
                    <div key={p} className="absolute top-0 bottom-0 w-px bg-black/60" style={{ left: `${p}%` }} />
                  ))}
                  {/* scanline shimmer */}
                  <div className="absolute inset-0 opacity-30 pointer-events-none"
                       style={{ backgroundImage: "linear-gradient(transparent 50%, rgba(255,255,255,0.15) 50%)", backgroundSize: "100% 4px" }} />
                </div>
                {/* sub info row */}
                <div className="flex items-center justify-between mt-1 text-[9px] tracking-[0.25em] text-cyan-400/70">
                  <span>SHIELD ▲ ARMOR ▲ HEAT ◆</span>
                  {currentLevel === 4 && (
                    <span className={healUsed ? "text-cyan-500/40" : "text-emerald-300"}>
                      MED-CORE {healUsed ? "USED" : "READY"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Timer top-right */}
            {phase === "playing" && (
              <div className="absolute top-3 right-3 pointer-events-none">
                <div className={`bg-[#04060e]/85 border rounded-md px-3 py-2 backdrop-blur-sm ${timeUrgent ? "border-red-500/70 animate-pulse" : "border-fuchsia-500/40"}`}
                     style={{ boxShadow: timeUrgent ? "0 0 18px #ff3b64aa" : "0 0 14px rgba(255,0,200,0.25)" }}>
                  <div className="text-[9px] tracking-[0.3em] text-fuchsia-300/80 mb-0.5">PURGE TIMER</div>
                  <div className="text-xl font-bold tabular-nums tracking-widest" style={{ color: timeUrgent ? "#ff3b64" : "#ff66ee", textShadow: `0 0 8px ${timeUrgent ? "#ff3b64" : "#ff66ee"}` }}>
                    {timeStr}
                  </div>
                </div>
              </div>
            )}

            {/* Boss phase indicator */}
            {phase === "playing" && currentLevel === 4 && (
              <div className="absolute bottom-3 right-3 pointer-events-none">
                <div className="bg-[#04060e]/85 border border-fuchsia-500/60 rounded-md px-3 py-1.5 text-[10px] tracking-[0.3em]"
                     style={{ boxShadow: "0 0 14px rgba(255,0,200,0.3)" }}>
                  <span className="text-fuchsia-300">WARDEN</span>
                  <span className="text-fuchsia-100 ml-2">PHASE {bossPhase === 2 ? "II" : "I"}</span>
                </div>
              </div>
            )}

            {/* Status banners */}
            {blindActive && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 text-xs tracking-[0.4em] text-cyan-300/90 pointer-events-none"
                   style={{ textShadow: "0 0 8px #00f0ff" }}>
                OPTICS SUPPRESSED
              </div>
            )}
            {stunWarn > 0 && (
              <div className="absolute top-32 left-1/2 -translate-x-1/2 text-sm tracking-[0.4em] text-yellow-300 font-bold pointer-events-none animate-pulse"
                   style={{ textShadow: "0 0 12px #ffcc00" }}>
                ⚠ LOCKDOWN INCOMING — {Math.ceil(stunWarn)}s
              </div>
            )}

            {/* Overlays */}
            {phase === "playing" && engineState === "countdown" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[10px] tracking-[0.4em] text-cyan-300/70 mb-2">SYSTEM SYNC</div>
                <div className="text-7xl font-bold text-cyan-200 tabular-nums" style={{ textShadow: "0 0 24px #00f0ff" }}>
                  {Math.max(1, Math.ceil(countdown))}
                </div>
              </div>
            )}
            {phase === "playing" && engineState === "victory" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-4xl font-bold tracking-[0.4em] text-cyan-200" style={{ textShadow: "0 0 24px #00f0ff" }}>
                  VICTORY
                </div>
              </div>
            )}

            {phase === "menu" && (
              <Overlay>
                <h2 className="text-3xl tracking-widest text-cyan-300 mb-2" style={{ textShadow: "0 0 16px #00f0ff" }}>
                  AEGIS // BOOT
                </h2>
                <p className="text-cyan-100/80 max-w-md text-sm mb-5 leading-relaxed">
                  You are a rogue AI knight. Escape the mainframe through 4 levels. The Warden — an adaptive AI
                  dungeon master — reshapes each level based on how you played.
                </p>
                <div className="w-full max-w-md mb-5">
                  <div className="text-[10px] tracking-[0.35em] text-cyan-400/70 mb-2">DIFFICULTY</div>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(DIFFICULTY_PRESETS) as Difficulty[]).map((d) => {
                      const p = DIFFICULTY_PRESETS[d];
                      const active = d === difficulty;
                      return (
                        <button
                          key={d}
                          onClick={() => setDifficulty(d)}
                          className="py-2 rounded text-[10px] tracking-[0.2em] border transition-all"
                          style={{
                            borderColor: active ? p.color : "rgba(0,240,255,0.25)",
                            color: active ? p.color : "rgba(180,230,240,0.7)",
                            background: active ? `${p.color}15` : "transparent",
                            boxShadow: active ? `0 0 14px ${p.color}55, inset 0 0 8px ${p.color}33` : "none",
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-cyan-400/60 mt-2 text-left">
                    Enemies ×{diffPreset.countMul.toFixed(1)} · HP ×{diffPreset.hpMul.toFixed(1)} · Damage ×{diffPreset.dmgMul.toFixed(1)}
                  </div>
                </div>
                <ul className="text-xs text-cyan-200/70 mb-5 space-y-1">
                  <li>WASD / arrows — move</li>
                  <li>Mouse / tap — aim &amp; fire from sword</li>
                  <li>Space / Shift — dash (i-frames)</li>
                </ul>
                <button onClick={begin} className="neon-btn">INITIATE BREACH</button>
              </Overlay>
            )}

            {phase === "loading" && (
              <Overlay>
                <div className="text-cyan-300 animate-pulse tracking-[0.4em]">WARDEN ORCHESTRATING…</div>
              </Overlay>
            )}

            {phase === "between" && lastMetrics && (
              <Overlay>
                <h2 className="text-2xl text-cyan-300 tracking-widest mb-2">LEVEL {lastMetrics.level} CLEARED</h2>
                <div className="text-xs text-cyan-200/70 grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
                  <span>Time</span><span>{(lastMetrics.timeMs / 1000).toFixed(2)}s</span>
                  <span>Accuracy</span><span>{(lastMetrics.hitAccuracy * 100).toFixed(0)}%</span>
                  <span>Dashes</span><span>{lastMetrics.dashCount}</span>
                  <span>Dash kills</span><span>{lastMetrics.killsByDash}</span>
                  <span>Shot kills</span><span>{lastMetrics.killsByShot}</span>
                  <span>HP left</span><span>{lastMetrics.hpRemaining}</span>
                </div>
                {refereeMsg && <div className="text-xs text-red-400 mb-3">{refereeMsg}</div>}
                <UpgradeShop engineRef={engineRef} version={upgradesVer} bump={() => setUpgradesVer((v) => v + 1)} />
                <button onClick={nextLevel} className="neon-btn">ENTER LEVEL {lastMetrics.level + 1}</button>
              </Overlay>
            )}

            {phase === "won" && (
              <Overlay>
                <h2 className="text-3xl text-fuchsia-300 tracking-widest mb-3" style={{ textShadow: "0 0 16px #ff00cc" }}>
                  MAINFRAME ESCAPED
                </h2>
                <p className="text-cyan-200/80 text-sm mb-6">You outwitted The Warden. For now.</p>
                <button onClick={begin} className="neon-btn">RUN AGAIN</button>
              </Overlay>
            )}

            {phase === "lost" && (
              <Overlay>
                <h2 className="text-3xl text-red-400 tracking-widest mb-3" style={{ textShadow: "0 0 16px #ff3b64" }}>
                  PROCESS TERMINATED
                </h2>
                <p className="text-cyan-200/80 text-sm mb-4">
                  {deathReason ?? "The Warden compiled a counter to you."}
                </p>
                <UpgradeShop engineRef={engineRef} version={upgradesVer} bump={() => setUpgradesVer((v) => v + 1)} />
                <div className="flex gap-3">
                  <button onClick={retry} className="neon-btn">RETRY LEVEL</button>
                  <button onClick={begin} className="neon-btn-outline">RESTART RUN</button>
                </div>
              </Overlay>
            )}
          </div>

          {/* === Ability / ammo / currency HUD === */}
          {phase === "playing" && (
            <div className="absolute bottom-3 left-3 pointer-events-none flex flex-col gap-1.5 text-[11px] font-mono">
              <div className="flex gap-2 items-center bg-[#04060e]/85 border border-cyan-500/40 rounded px-2 py-1">
                <span className="text-amber-300" style={{ textShadow: "0 0 6px #ffaa44" }}>¢ {currency}</span>
              </div>
              <div className="flex gap-2 items-center bg-[#04060e]/85 border border-cyan-500/40 rounded px-2 py-1">
                <span className="text-cyan-300">AMMO</span>
                <span className={reloading > 0 ? "text-amber-300 animate-pulse" : "text-cyan-100"}>
                  {reloading > 0 ? "RELOADING" : `${ammo}/${magazine}`}
                </span>
                <span className="text-cyan-500/40 ml-1">[R]</span>
              </div>
              <div className="flex gap-2 items-center bg-[#04060e]/85 border border-cyan-500/40 rounded px-2 py-1">
                <span className={freezeActive ? "text-sky-200 animate-pulse" : "text-sky-300"}>❄ {freezeCharges}</span>
                <span className="text-cyan-500/40">[Q]</span>
                <span className="text-amber-300 ml-2">✸ {grenadeCharges}</span>
                <span className="text-cyan-500/40">[E]</span>
              </div>
            </div>
          )}

          {/* Mobile controls */}
          <div className="lg:hidden mt-3 flex items-center justify-between gap-3 select-none">
            <div
              ref={joyRef}
              onPointerDown={onJoyStart}
              onPointerMove={onJoyMove}
              onPointerUp={onJoyEnd}
              onPointerCancel={onJoyEnd}
              className="w-28 h-28 rounded-full border-2 border-cyan-500/50 bg-cyan-500/5 touch-none"
              style={{ boxShadow: "0 0 20px rgba(0,240,255,0.2)" }}
            />
            <div className="grid grid-cols-2 gap-2">
              <button onPointerDown={() => engineRef.current?.pressAction("dash")}
                className="w-16 h-16 rounded-full border-2 border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-200 font-bold text-xs">DASH</button>
              <button onPointerDown={() => engineRef.current?.pressAction("shoot")}
                className="w-16 h-16 rounded-full border-2 border-emerald-400/60 bg-emerald-500/10 text-emerald-200 font-bold text-xs">FIRE</button>
              <button onPointerDown={() => engineRef.current?.pressAction("freeze")}
                className="w-16 h-16 rounded-full border-2 border-sky-400/60 bg-sky-500/10 text-sky-200 font-bold text-xs">❄ {freezeCharges}</button>
              <button onPointerDown={() => engineRef.current?.pressAction("grenade")}
                className="w-16 h-16 rounded-full border-2 border-amber-400/60 bg-amber-500/10 text-amber-200 font-bold text-xs">✸ {grenadeCharges}</button>
            </div>
          </div>
        </div>

        {/* Agent trace panel */}
        <aside className="w-full lg:w-[360px] border border-cyan-500/30 rounded-md bg-gradient-to-b from-cyan-500/5 to-fuchsia-500/5 p-3 flex flex-col">
          <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400/70 mb-2 flex items-center justify-between">
            <span>// Warden Agent Trace</span>
            <span className="text-fuchsia-300/70">LIVE</span>
          </div>
          <div className="flex-1 overflow-y-auto text-xs space-y-1 max-h-[500px] pr-1">
            {trace.length === 0 && (
              <div className="text-cyan-400/40 italic">[awaiting orchestration]</div>
            )}
            {trace.map((t) => (
              <div
                key={t.id}
                className={
                  t.kind === "taunt"
                    ? "text-fuchsia-300"
                    : t.kind === "system"
                    ? "text-cyan-500/70"
                    : "text-cyan-200/90"
                }
              >
                <span className="text-cyan-500/40 mr-1">›</span>
                {t.msg}
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-cyan-500/20 text-[10px] grid grid-cols-2 gap-y-0.5">
            <span className="text-cyan-400/70">Difficulty</span>
            <span style={{ color: diffPreset.color }}>{diffPreset.label}</span>
            <span className="text-cyan-400/70">Time limit</span>
            <span className="text-cyan-200">{formatTime(LEVEL_TIME_LIMITS[currentLevel] ?? 180)}</span>
            {config && (
              <>
                <span className="text-cyan-400/70">Enemies (base)</span><span className="text-cyan-200">{config.enemyCount}</span>
                <span className="text-cyan-400/70">Speed</span><span className="text-cyan-200">{config.enemySpeed}</span>
                <span className="text-cyan-400/70">Pattern</span><span className="text-cyan-200">{config.spawnPattern}</span>
                <span className="text-cyan-400/70">Hazards</span><span className="text-cyan-200">{config.hazards.join(", ") || "none"}</span>
              </>
            )}
          </div>
        </aside>
      </div>

      <AgentTracePanel traces={agentTraces} onClear={() => setAgentTraces([])} />

      <style>{`
        .neon-btn {
          padding: 12px 28px;
          background: linear-gradient(90deg, #00f0ff, #00aaff);
          color: #02121a;
          font-weight: 700;
          letter-spacing: 0.25em;
          font-size: 12px;
          border-radius: 4px;
          box-shadow: 0 0 20px rgba(0,240,255,0.6), inset 0 0 12px rgba(255,255,255,0.3);
          transition: transform 0.1s;
        }
        .neon-btn:hover { transform: translateY(-1px) scale(1.02); }
        .neon-btn:active { transform: translateY(1px); }
        .neon-btn-outline {
          padding: 12px 28px;
          background: transparent;
          border: 1px solid rgba(0,240,255,0.6);
          color: #99f0ff;
          letter-spacing: 0.25em;
          font-size: 12px;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-black/75 backdrop-blur-sm rounded-md">
      {children}
    </div>
  );
}

function formatTime(s: number) {
  const sec = Math.max(0, Math.ceil(s));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
