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
  const [wonCinematicStage, setWonCinematicStage] = useState<"quote" | "farewell" | "credits">("quote");
  const [weaponMode, setWeaponMode] = useState<"sword" | "gun">("sword");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [countdown, setCountdown] = useState(0);
  const [timeLeft, setTimeLeft] = useState(180);
  const [engineState, setEngineState] = useState<"countdown" | "playing" | "victory" | "dead">(
    "countdown",
  );
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
  const [bulletsEnabled, setBulletsEnabled] = useState(false);
  const [reloading, setReloading] = useState(0);
  const [freezeCharges, setFreezeCharges] = useState(0);
  const [grenadeCharges, setGrenadeCharges] = useState(0);
  const [freezeActive, setFreezeActive] = useState(false);
  const [upgradesVer, setUpgradesVer] = useState(0); // bump to re-render shop
  const [menuTab, setMenuTab] = useState<
    "root" | "difficulty" | "controls" | "records" | "tutorial" | "upgrades"
  >("root");
  const [shopReferrer, setShopReferrer] = useState<"menu" | "pause">("menu");
  const [isPaused, setIsPaused] = useState(false);
  const [sensitivity, setSensitivity] = useState(1.0);
  const [btnScale, setBtnScale] = useState(1.0);
  const [invertControls, setInvertControls] = useState(false);
  const [controlsAlpha, setControlsAlpha] = useState(0.8);
  const [autoAim, setAutoAim] = useState(true);
  const [tutorialSlide, setTutorialSlide] = useState(0);
  const [highScores, setHighScores] = useState({
    maxLevel: 1,
    bestTime: 999,
    bestAccuracy: 0,
    totalCredits: 0,
  });

  const [objChests, setObjChests] = useState({ opened: 0, total: 0 });
  const [objHostiles, setObjHostiles] = useState({ killed: 0, total: 0 });
  const [gateOpen, setGateOpen] = useState(false);

  const traceIdRef = useRef(0);

  const [agentTraces, setAgentTraces] = useState<TraceEntry[]>([]);

  const pushAgentTrace = useCallback(
    (
      agent: TraceEntry["agent"],
      action: string,
      decision: string,
      reasoning: string[],
      isThinking = false,
    ) => {
      setAgentTraces((prev) => {
        const timestamp = new Date().toLocaleTimeString();
        const id = `${agent}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const filtered = prev.filter((t) => !(t.agent === agent && t.isThinking));
        return [
          { id, agent, action, decision, reasoning, timestamp, isThinking },
          ...filtered,
        ].slice(0, 50);
      });
    },
    [],
  );

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
    if (phase === "won") {
      if (wonCinematicStage === "quote") {
        const t = setTimeout(() => setWonCinematicStage("farewell"), 5000);
        return () => clearTimeout(t);
      } else if (wonCinematicStage === "farewell") {
        const t = setTimeout(() => setWonCinematicStage("credits"), 4000);
        return () => clearTimeout(t);
      }
    }
  }, [phase, wonCinematicStage]);

  useEffect(() => {
    const scores = localStorage.getItem("aegis_records");
    if (scores) {
      try {
        setHighScores(JSON.parse(scores));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const updateRecords = (lvl: number, timeS: number, acc: number, collected: number) => {
    setHighScores((prev) => {
      const next = {
        maxLevel: Math.max(prev.maxLevel, lvl),
        bestTime: lvl >= prev.maxLevel ? Math.min(prev.bestTime, timeS) : prev.bestTime,
        bestAccuracy: Math.max(prev.bestAccuracy, acc),
        totalCredits: prev.totalCredits + Math.round(collected),
      };
      localStorage.setItem("aegis_records", JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = engineRef.current;
      const ctx = canvasRef.current?.getContext("2d");
      if (g && ctx) {
        g.autoAim = autoAim; // Synchronize auto-aim flag!
        if (phase === "playing" && !isPaused) {
          // Only update if not paused!
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
          const d = derive(g.upgrades);
          setMagazine(d.magazine);
          setBulletsEnabled(d.bulletsEnabled);
          setWeaponMode(g.weaponMode);
          setReloading(g.reloading);
          setFreezeCharges(g.freezeCharges);
          setGrenadeCharges(g.grenadeCharges);
          setFreezeActive(g.freezeActive > 0);
          setObjChests({ opened: g.openedChests, total: g.totalChests });
          setObjHostiles({ killed: g.killedHostiles, total: g.totalHostiles });
          setGateOpen(g.exitGate.open);
          const boss = g.enemies.find((e) => e.isBoss);
          if (boss) setBossPhase((boss.bossPhase ?? 1) as 1 | 2);
        }
        ctx.save();
        ctx.scale(2, 2);
        render(ctx, g);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, isPaused, autoAim]);

  useEffect(() => {
    const g = engineRef.current;
    if (!g) return;
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          " ",
          "q",
          "e",
          "r",
          "f",
          "j",
          "z",
          "x",
          "c",
          "1",
          "2",
          "tab",
          "enter",
        ].includes(k)
      )
        e.preventDefault();
      if (k === " " || k === "shift") g.pressAction("dash");
      else if (k === "q") g.pressAction("freeze");
      else if (k === "e") g.pressAction("grenade");
      else if (k === "r") g.pressAction("reload");
      else if (k === "j" || k === "z" || k === "x" || k === "enter")
        g.pressAction("shoot");
      else if (k === "1") {
        g.weaponMode = "sword";
        audio.play("menu");
      } else if (k === "2") {
        g.weaponMode = "gun";
        audio.play("menu");
      } else if (k === "c" || k === "tab" || k === "f") {
        g.weaponMode = g.weaponMode === "sword" ? "gun" : "sword";
        audio.play("menu");
      } else g.keys.add(k);
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
    e.preventDefault(); // Prevents default browser double-click zooming, selections, and dragging glitches!
    handlePointer(e);
    const g = engineRef.current;
    if (!g) return;
    g.pointerDown = true;
    g.pressAction("shoot");
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const g = engineRef.current;
    if (g) g.pointerDown = false;
  };

  const startLevel = useCallback(
    async (lvl: number, prevMetrics: PlayerMetrics | null) => {
      setPhase("loading");
      setDeathReason(null);
      setIsPaused(false);
      pushTrace(`Warden orchestrating Level ${lvl} on ${difficulty.toUpperCase()}…`, "system");

      // Trigger thinking state for Strategy and Narrative Agents
      pushAgentTrace(
        "strategy",
        "Orchestrating level parameters & class balancing",
        "Running tactical simulation...",
        [],
        true,
      );
      pushAgentTrace(
        "narrative",
        "Evaluating Aegis performance & selecting taunt vector",
        "Analyzing psychological telemetry...",
        [],
        true,
      );

      try {
        const cfg = await callWarden({ data: { level: lvl, metrics: prevMetrics } });

        // Resolve Strategy Agent Trace
        pushAgentTrace(
          "strategy",
          `Level ${lvl} Strategy Configuration`,
          `Difficulty: ${cfg.difficulty.toFixed(2)} | Enemies: ${cfg.enemyCount} (Hp:${cfg.enemyHp}, Spd:${cfg.enemySpeed}) | Spawn: ${cfg.spawnPattern.toUpperCase()}`,
          cfg.strategyReasoning || cfg.reasoning || [],
        );

        // Resolve Narrative Agent Trace
        pushAgentTrace(
          "narrative",
          `Synthesizing Taunt for Aegis`,
          `Taunt Selected: "${cfg.taunt}"`,
          cfg.narrativeReasoning || [],
        );

        setConfig(cfg);
        setCurrentLevel(lvl);
        const g = engineRef.current!;
        g.setDifficulty(difficulty);
        g.loadLevel(cfg);

        if (lvl === 4) {
          audio.startBossMusic();
        } else {
          audio.stopBossMusic();
        }

        setHp(g.player.hp);
        setMaxHp(g.player.maxHp);
        setTimeLeft(g.timeLeft);
        setBossPhase(1);
        setPhase("playing");
      } catch (err) {
        pushTrace(`Warden unreachable: ${(err as Error).message}`, "system");
        setAgentTraces((prev) => prev.filter((t) => !t.isThinking));
        setPhase("menu");
      }
    },
    [callWarden, pushTrace, difficulty, pushAgentTrace],
  );

  const handleLevelCleared = async (metrics: PlayerMetrics) => {
    setLastMetrics(metrics);
    setPhase("between");
    audio.stopBossMusic();
    updateRecords(metrics.level, metrics.timeMs / 1000, metrics.hitAccuracy, metrics.damageDealt);
    pushTrace(
      `Level ${metrics.level} cleared in ${(metrics.timeMs / 1000).toFixed(1)}s — acc ${(metrics.hitAccuracy * 100).toFixed(0)}%`,
      "system",
    );

    // Trigger thinking state for Referee Agent
    pushAgentTrace(
      "referee",
      `Auditing Aegis telemetry for Level ${metrics.level}`,
      "Performing standard safety analysis...",
      [],
      true,
    );

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
          ...(v.reasoning || []),
        ],
      );

      if (!v.valid) {
        setRefereeMsg(`Referee flagged: ${v.reasons.join(", ")}`);
        pushTrace(`REFEREE: invalid run — ${v.reasons.join(", ")}`, "system");
      } else {
        setRefereeMsg(null);
        pushTrace("REFEREE: run validated ✓", "system");
      }
    } catch (err) {
      setAgentTraces((prev) => prev.filter((t) => !t.isThinking));
      pushTrace(`Referee unreachable: ${(err as Error).message}`, "system");
    }
    if (metrics.level >= 4) {
      setWonCinematicStage("quote");
      setPhase("won");
    }
  };

  const handleDeath = (reason?: string) => {
    setPhase("lost");
    audio.stopBossMusic();
    if (reason) setDeathReason(reason);
    if (engineRef.current) {
      const g = engineRef.current;
      updateRecords(
        g.level,
        g.elapsed,
        g.m.shotsFired > 0 ? g.m.shotsHit / g.m.shotsFired : 0,
        g.m.damageDealt,
      );
    }
    pushTrace(reason ?? "Aegis terminated. The Warden prevails.", "system");
  };

  const begin = () => {
    audio.ensure();
    audio.resume();
    audio.play("menu");
    setTrace([]);
    setLastMetrics(null);
    setRefereeMsg(null);
    setDeathReason(null);
    setMenuTab("root");
    setIsPaused(false);
    // Fresh run: reset progression
    if (engineRef.current) {
      engineRef.current.currency = 0;
      engineRef.current.upgrades = {
        hp: 0,
        sword: 0,
        bullet: 0,
        capacity: 0,
        freeze: 0,
        grenade: 0,
      };
    }
    setUpgradesVer((v) => v + 1);
    startLevel(1, null);
  };
  const nextLevel = () => {
    if (lastMetrics) startLevel(lastMetrics.level + 1, lastMetrics);
  };
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
  const [joyLocked, setJoyLocked] = useState(false);
  const lockThreshold = 100; // px

  const onJoyStart = (e: React.PointerEvent) => {
    if (joyLocked) {
      setJoyLocked(false);
      if (engineRef.current) engineRef.current.virtualMove = { x: 0, y: 0 };
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    joyCenter.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    joyActive.current = true;
    onJoyMove(e);
  };
  const onJoyMove = (e: React.PointerEvent) => {
    if (!joyActive.current || !engineRef.current) return;
    const dx = e.clientX - joyCenter.current.x;
    const dy = e.clientY - joyCenter.current.y;
    const d = Math.hypot(dx, dy);

    if (d > lockThreshold && !joyLocked) {
      setJoyLocked(true);
      audio.play("menu");
    }

    const m = Math.min(1, d / 50);
    const a = Math.atan2(dy, dx);
    engineRef.current.virtualMove = {
      x: Math.cos(a) * m * sensitivity,
      y: Math.sin(a) * m * sensitivity,
    };
  };
  const onJoyEnd = () => {
    joyActive.current = false;
    if (!joyLocked && engineRef.current) {
      engineRef.current.virtualMove = { x: 0, y: 0 };
    }
  };

  const hpPct = (hp / maxHp) * 100;
  const hpColor = hp > maxHp * 0.5 ? "#00f0ff" : hp > maxHp * 0.25 ? "#ffcc00" : "#ff3b64";
  const timeStr = formatTime(timeLeft);
  const timeUrgent = timeLeft < 30;
  const diffPreset = DIFFICULTY_PRESETS[difficulty];

  return (
    <div className="flex flex-col h-screen w-full bg-[#05060e] text-cyan-100 font-mono">
      {/* Portrait rotation warning overlay */}
      <div className="portrait-warning">
        <div className="phone-container rotate-phone-animation">
          <div className="phone-screen" />
          <div className="phone-home-button" />
        </div>
        <h2>LANDSCAPE REQUIRED</h2>
        <p className="uppercase tracking-widest text-[9px] text-cyan-400/60 mt-1.5">// ROTATE YOUR DEVICE TO ACTIVATE UI //</p>
      </div>
      <header className="border-b border-cyan-500/30 px-4 py-3 flex items-center justify-between bg-gradient-to-r from-[#05060e] via-[#0a0f24] to-[#05060e]">
        <h1
          className="text-xl tracking-[0.3em] text-cyan-300"
          style={{ textShadow: "0 0 12px #00f0ff" }}
        >
          THE WARDEN&apos;S LABYRINTH
        </h1>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-cyan-400/70">{LEVEL_NAMES[currentLevel]}</span>
          <span
            className="px-2 py-0.5 rounded border tracking-widest"
            style={{
              borderColor: diffPreset.color,
              color: diffPreset.color,
              boxShadow: `0 0 10px ${diffPreset.color}55`,
            }}
          >
            {diffPreset.label}
          </span>
        </div>
      </header>
<div className="flex flex-col items-center justify-center p-1.5 sm:p-4 w-full flex-1 overflow-hidden">
  <div
    className="relative aspect-[3/2] w-full bg-slate-950/80 border border-cyan-500/40 rounded-md overflow-hidden"
    style={{
      maxWidth: "min(1350px, 100%, calc(150vh - 120px))",
      boxShadow: "0 0 40px rgba(0,240,255,0.15)",
    }}
  >
      <canvas
        ref={canvasRef}
        width={VIEW_W * 2}
        height={VIEW_H * 2}
        onPointerMove={handlePointer}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="absolute inset-0 w-full h-full touch-none"
      />

            {/* PAUSE BUTTON & MENU TRIGGER */}
            {phase === "playing" && !isPaused && (
              <div className="absolute top-3 left-8 pointer-events-auto z-30">
                <button
                  onClick={() => {
                    setIsPaused(!isPaused);
                    audio.play("pause");
                    if (currentLevel === 4) {
                      if (!isPaused) audio.stopBossMusic();
                      else audio.startBossMusic();
                    }
                  }}
                  className="px-3 py-1.5 rounded border border-cyan-500/40 bg-slate-950/80 text-cyan-300 text-[10px] tracking-[0.2em] font-mono hover:bg-cyan-500/20 transition-all shadow-[0_0_12px_rgba(0,240,255,0.15)] flex items-center gap-1.5 cursor-pointer select-none"
                  onMouseEnter={() => audio.play("menu")}
                >
                  <span className="text-[8px]">{isPaused ? "▶" : "‖"}</span>{" "}
                  {isPaused ? "RESUME" : "PAUSE"}
                </button>
              </div>
            )}

            {/* TIME REMAINING TIMER OVERLAY */}
            {phase === "playing" && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-950/85 border border-cyan-500/30 rounded-md px-3.5 py-1 flex items-center gap-2.5 backdrop-blur-md shadow-[0_0_15px_rgba(0,240,255,0.15)] pointer-events-none z-30 select-none">
                <span className="text-[9px] tracking-[0.2em] text-cyan-400/70 font-bold uppercase">
                  TIME LIMIT:
                </span>
                <span
                  className={`text-sm font-bold tabular-nums tracking-wider ${timeUrgent ? "text-red-500 animate-pulse" : "text-cyan-200"}`}
                  style={{ textShadow: timeUrgent ? "0 0 8px #ff3b64" : "0 0 8px #00f0ff" }}
                >
                  {timeStr}
                </span>
              </div>
            )}

            {/* OBJECTIVES HUD */}
            {phase === "playing" && currentLevel !== 4 && (
              <div className="absolute top-[160px] right-3 pointer-events-none z-30 flex flex-col gap-1.5 items-end bg-slate-950/85 border border-cyan-500/30 rounded-md p-2 backdrop-blur-md shadow-[0_0_15px_rgba(0,240,255,0.15)] select-none min-w-[140px]">
                <span className="text-[9px] tracking-[0.2em] text-cyan-400/70 font-bold uppercase border-b border-cyan-500/30 pb-1 mb-0.5 w-full text-right">
                  OBJECTIVES
                </span>
                <div className="flex justify-between items-center text-[10px] font-mono w-full">
                  <span className="text-cyan-200/80">HOSTILES:</span>
                  <span
                    className={
                      objHostiles.killed >= objHostiles.total && objHostiles.total > 0
                        ? "text-emerald-400 font-bold"
                        : "text-cyan-400"
                    }
                  >
                    {objHostiles.killed} / {objHostiles.total}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-cyan-200/80">CACHES:</span>
                  <span
                    className={
                      objChests.opened >= objChests.total && objChests.total > 0
                        ? "text-emerald-400 font-bold"
                        : "text-cyan-400"
                    }
                  >
                    {objChests.opened} / {objChests.total}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-cyan-200/80">GATE:</span>
                  <span
                    className={
                      gateOpen ? "text-emerald-400 animate-pulse font-bold" : "text-red-400"
                    }
                  >
                    {gateOpen ? "OPEN" : "LOCKED"}
                  </span>
                </div>
              </div>
            )}

            {/* CYBERDECK HUD: HEALTH INTEGRITY BAR */}
            {phase === "playing" && (
              <div className="absolute bottom-3 left-3 bg-slate-950/90 border border-cyan-500/40 rounded-md p-2.5 w-60 backdrop-blur-md shadow-[0_0_20px_rgba(0,240,255,0.2)] flex flex-col gap-1.5 pointer-events-none select-none z-30">
                <div className="flex justify-between items-center text-[9px] tracking-wider text-cyan-400/80 font-bold">
                  <span>// INTEGRITY MODULE</span>
                  <span
                    className={
                      hpPct < 30 ? "text-red-400 animate-pulse font-bold" : "text-cyan-300"
                    }
                  >
                    {hpPct < 30 ? "CRITICAL ALERT" : "SYSTEM ONLINE"}
                  </span>
                </div>
                <div className="relative h-3.5 bg-cyan-950/30 border border-cyan-500/20 rounded overflow-hidden">
                  <div
                    className="h-full transition-all duration-150 ease-out"
                    style={{
                      width: `${Math.max(0, Math.min(100, hpPct))}%`,
                      background:
                        hpPct < 30
                          ? "linear-gradient(90deg, #ff3b64, #ff0055)"
                          : "linear-gradient(90deg, #00f0ff, #0088ff)",
                      boxShadow:
                        hpPct < 30
                          ? "0 0 10px rgba(255,59,100,0.6)"
                          : "0 0 10px rgba(0,240,255,0.6)",
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                    HP: {hp} / {maxHp}
                  </div>
                </div>
              </div>
            )}

            {/* CYBERDECK HUD: AMMO & UTILITIES HOTBAR */}
            {phase === "playing" && (
              <div className="absolute bottom-3 right-3 bg-slate-950/90 border border-cyan-500/40 rounded-md p-2.5 w-64 backdrop-blur-md shadow-[0_0_20px_rgba(0,240,255,0.2)] flex flex-col gap-1.5 pointer-events-none select-none z-30 font-mono">
                <div className="flex justify-between items-center border-b border-cyan-500/20 pb-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-cyan-400/70 font-bold uppercase">
                      CREDITS:
                    </span>
                    <span
                      className="text-amber-400 font-bold text-[11px]"
                      style={{ textShadow: "0 0 8px rgba(255, 170, 68, 0.4)" }}
                    >
                      ¢ {currency}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-cyan-400/70 font-bold uppercase">WEAPON:</span>
                    <span
                      className={`text-[10px] font-bold ${reloading > 0 ? "text-amber-400 animate-pulse" : "text-cyan-200"}`}
                    >
                      {!bulletsEnabled
                        ? "SWORD (Melee)"
                        : reloading > 0
                          ? "RELOAD"
                          : `PLASMA (${ammo}/${magazine})`}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                  <div className="flex items-center justify-between bg-cyan-950/30 border border-cyan-500/10 rounded px-2 py-0.5">
                    <span
                      className={
                        freezeActive ? "text-sky-200 animate-pulse" : "text-sky-300 font-bold"
                      }
                    >
                      ❄ CHRONO
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-cyan-100 font-bold">{freezeCharges}</span>
                      <span className="text-cyan-500/50 text-[8px]">[Q]</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-cyan-950/30 border border-cyan-500/10 rounded px-2 py-0.5">
                    <span className="text-amber-300 font-bold">✸ GRENADE</span>
                    <div className="flex items-center gap-1">
                      <span className="text-cyan-100 font-bold">{grenadeCharges}</span>
                      <span className="text-cyan-500/50 text-[8px]">[E]</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isPaused && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm z-50 animate-fade-in">
                {/* SAO Circular Abstract Logo */}
                <div className="w-16 h-16 rounded-full border-2 border-cyan-500/60 flex items-center justify-center mb-6 animate-pulse shadow-[0_0_20px_rgba(0,240,255,0.4)]">
                  <span className="text-cyan-300 text-lg font-bold">SAO</span>
                </div>
                <h3 className="text-cyan-200 tracking-[0.3em] text-xs mb-8 uppercase font-bold text-center">
                  LINK_START // PAUSE_PROTOCOL
                </h3>
                <div className="flex flex-col gap-3 w-64">
                  <button
                    onClick={() => {
                      setIsPaused(false);
                      audio.play("pause");
                      if (currentLevel === 4) audio.startBossMusic();
                    }}
                    className="sao-node w-full py-3 text-cyan-200 text-xs font-bold tracking-[0.25em] hover:text-white cursor-pointer select-none"
                    onMouseEnter={() => audio.play("menu")}
                  >
                    RESUME PURGE
                  </button>
                  <button
                    onClick={() => {
                      setIsPaused(false);
                      setShopReferrer("pause");
                      setPhase("menu");
                      setMenuTab("upgrades");
                      audio.stopBossMusic();
                      audio.play("pause");
                    }}
                    className="sao-node w-full py-3 text-fuchsia-300 text-xs font-bold tracking-[0.25em] hover:text-white cursor-pointer select-none"
                    style={{ borderColor: "rgba(255, 0, 204, 0.4)" }}
                    onMouseEnter={() => audio.play("menu")}
                  >
                    UPGRADE PROTOCOL
                  </button>
                  <button
                    onClick={() => {
                      setIsPaused(false);
                      retry();
                    }}
                    className="sao-node w-full py-3 text-cyan-200 text-xs font-bold tracking-[0.25em] hover:text-white cursor-pointer select-none"
                    onMouseEnter={() => audio.play("menu")}
                  >
                    RESTART REGION
                  </button>
                  <button
                    onClick={() => {
                      setIsPaused(false);
                      setShopReferrer("pause");
                      audio.stopBossMusic();
                      setPhase("menu");
                      setMenuTab("controls");
                    }}
                    className="sao-node w-full py-3 text-cyan-200 text-xs font-bold tracking-[0.25em] hover:text-white cursor-pointer select-none"
                    onMouseEnter={() => audio.play("menu")}
                  >
                    CONTROL INDEX
                  </button>
                  <button
                    onClick={() => {
                      setIsPaused(false);
                      audio.stopBossMusic();
                      setPhase("menu");
                      setMenuTab("root");
                    }}
                    className="sao-node w-full py-3 text-red-400 text-xs font-bold tracking-[0.25em] hover:text-white cursor-pointer select-none"
                    style={{ borderColor: "rgba(255,59,100,0.3)" }}
                    onMouseEnter={() => audio.play("menu")}
                  >
                    QUIT SESSION
                  </button>
                </div>
              </div>
            )}

            {/* Overlays */}
            {phase === "playing" && engineState === "countdown" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
                <div className="text-[10px] tracking-[0.4em] text-cyan-300/70 mb-2">
                  SYSTEM SYNC
                </div>
                <div
                  className="text-7xl font-bold text-cyan-200 tabular-nums"
                  style={{ textShadow: "0 0 24px #00f0ff" }}
                >
                  {Math.max(1, Math.ceil(countdown))}
                </div>
              </div>
            )}
            {phase === "playing" && engineState === "victory" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
                <div
                  className="text-4xl font-bold tracking-[0.4em] text-cyan-200"
                  style={{ textShadow: "0 0 24px #00f0ff" }}
                >
                  VICTORY
                </div>
              </div>
            )}

            {phase === "menu" && (
              <Overlay>
                {menuTab === "root" && (
                  <div className="flex flex-col items-center justify-center w-full max-w-md py-4 animate-[float-sao_0.35s_ease-out]">
                    {/* Cyber logo */}
                    <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-lg border-2 border-cyan-500/50 rotate-45 animate-pulse shadow-[0_0_20px_rgba(0,240,255,0.3)]" />
                      <div className="absolute w-12 h-12 rounded border border-fuchsia-500/50 -rotate-12 animate-[spin_10s_linear_infinite]" />
                      <span
                        className="text-cyan-300 text-lg font-bold select-none animate-[cyber-glitch_4s_infinite]"
                        style={{ textShadow: "0 0 10px #00f0ff" }}
                      >
                        Ω
                      </span>
                    </div>

                    <h2
                      className="text-2xl font-bold tracking-[0.25em] text-cyan-300 mb-0.5"
                      style={{ textShadow: "0 0 16px #00f0ff" }}
                    >
                      NEXUS SHIFT
                    </h2>
                    <div className="text-[9px] tracking-[0.45em] text-fuchsia-400/80 mb-6 font-bold uppercase">
                      // AEGIS_PURGE.EXE
                    </div>

                    <div className="flex flex-col gap-3.5 w-full px-4">
                      <button
                        onClick={() => {
                          setMenuTab("difficulty");
                          audio.play("pause");
                        }}
                        className="sao-node py-3.5 text-cyan-200 text-xs font-bold tracking-[0.3em] cursor-pointer select-none"
                        onMouseEnter={() => audio.play("menu")}
                      >
                        START THE PURGE
                      </button>
                      <button
                        onClick={() => {
                          setMenuTab("controls");
                          audio.play("pause");
                        }}
                        className="sao-node py-3.5 text-cyan-200 text-xs font-bold tracking-[0.3em] cursor-pointer select-none"
                        onMouseEnter={() => audio.play("menu")}
                      >
                        CONTROL INDEX
                      </button>
                      <button
                        onClick={() => {
                          setShopReferrer("menu");
                          setMenuTab("upgrades");
                          audio.play("pause");
                        }}
                        className="sao-node py-3.5 text-cyan-200 text-xs font-bold tracking-[0.3em] cursor-pointer select-none"
                        onMouseEnter={() => audio.play("menu")}
                      >
                        UPGRADES
                      </button>
                      <button
                        onClick={() => {
                          setMenuTab("records");
                          audio.play("pause");
                        }}
                        className="sao-node py-3.5 text-cyan-200 text-xs font-bold tracking-[0.3em] cursor-pointer select-none"
                        onMouseEnter={() => audio.play("menu")}
                      >
                        SYSTEM RECORDS
                      </button>
                      <button
                        onClick={() => {
                          audio.play("death");
                          const confirmExit = window.confirm(
                            "DE-AUTHORIZE PROTOCOL: Close escape channel?",
                          );
                          if (confirmExit) window.location.reload();
                        }}
                        className="sao-node py-3.5 text-red-400 text-xs font-bold tracking-[0.3em] cursor-pointer select-none"
                        style={{ borderColor: "rgba(255,59,100,0.3)" }}
                        onMouseEnter={() => audio.play("menu")}
                      >
                        SHUTDOWN SESSION
                      </button>
                    </div>
                  </div>
                )}

                {menuTab === "upgrades" && (
                  <div className="flex flex-col items-center justify-center w-full max-w-3xl py-4 animate-[float-sao_0.3s_ease-out]">
                    <h3 className="text-cyan-300 tracking-[0.2em] text-sm font-bold mb-4 uppercase">
                      AEGIS UPGRADE SYSTEM
                    </h3>
                    <UpgradeShop
                      engineRef={engineRef}
                      version={upgradesVer}
                      bump={() => setUpgradesVer((v) => v + 1)}
                    />
                    <button
                      onClick={() => {
                        if (shopReferrer === "pause") {
                          setPhase("playing");
                          setIsPaused(true);
                        } else {
                          setMenuTab("root");
                        }
                        audio.play("pause");
                      }}
                      className="neon-btn w-full max-w-md select-none cursor-pointer mt-2"
                      onMouseEnter={() => audio.play("menu")}
                    >
                      {shopReferrer === "pause" ? "RETURN TO PAUSE" : "RETURN TO ROOT"}
                    </button>
                  </div>
                )}

                {menuTab === "difficulty" && (
                  <div className="flex flex-col items-center justify-center w-full max-w-md py-4 animate-[float-sao_0.3s_ease-out]">
                    <h3 className="text-cyan-300 tracking-[0.2em] text-sm font-bold mb-4 uppercase">
                      SELECT INTRUSION INTENSITY
                    </h3>
                    <div className="w-full mb-6">
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {(Object.keys(DIFFICULTY_PRESETS) as Difficulty[]).map((d) => {
                          const p = DIFFICULTY_PRESETS[d];
                          const active = d === difficulty;
                          return (
                            <button
                              key={d}
                              onClick={() => {
                                setDifficulty(d);
                                audio.play("pause");
                              }}
                              className="py-3 rounded text-[10px] tracking-[0.2em] border transition-all cursor-pointer font-bold select-none"
                              style={{
                                borderColor: active ? p.color : "rgba(0,240,255,0.2)",
                                color: active ? p.color : "rgba(180,230,240,0.7)",
                                background: active ? `${p.color}15` : "rgba(4,6,14,0.3)",
                                boxShadow: active ? `0 0 14px ${p.color}44` : "none",
                              }}
                              onMouseEnter={() => audio.play("menu")}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-cyan-400/80 mt-2 bg-cyan-950/20 border border-cyan-500/10 p-2.5 rounded text-left leading-relaxed">
                        <span className="text-cyan-200 font-bold block mb-1">WARDEN SPECS:</span>
                        Hostile scaling factor is active. Enemy quantities are scaled to{" "}
                        <span className="text-fuchsia-400 font-bold">
                          ×{diffPreset.countMul.toFixed(1)}
                        </span>
                        , baseline hit points to{" "}
                        <span className="text-fuchsia-400 font-bold">
                          ×{diffPreset.hpMul.toFixed(1)}
                        </span>
                        , and deal damage at{" "}
                        <span className="text-fuchsia-400 font-bold">
                          ×{diffPreset.dmgMul.toFixed(1)}
                        </span>{" "}
                        standard power.
                      </div>
                    </div>
                    <div className="flex gap-3 w-full px-4">
                      <button
                        onClick={() => {
                          setMenuTab("tutorial");
                          setTutorialSlide(0);
                          audio.play("pause");
                        }}
                        className="neon-btn flex-1 select-none cursor-pointer"
                        onMouseEnter={() => audio.play("menu")}
                      >
                        INITIATE PURGE
                      </button>
                      <button
                        onClick={() => {
                          setMenuTab("root");
                          audio.play("pause");
                        }}
                        className="neon-btn-outline select-none cursor-pointer"
                        onMouseEnter={() => audio.play("menu")}
                      >
                        BACK
                      </button>
                    </div>
                  </div>
                )}

                {menuTab === "controls" && (
                  <div className="flex flex-col items-center justify-center w-full max-w-lg py-4 animate-[float-sao_0.3s_ease-out]">
                    <h3 className="text-cyan-300 tracking-[0.2em] text-sm font-bold mb-4 uppercase">
                      SYSTEM CONTROL MATRIX
                    </h3>
                    <div className="w-full text-left text-xs bg-cyan-950/20 border border-cyan-500/15 p-4 rounded mb-5 space-y-4 max-h-[220px] overflow-y-auto pr-1">
                      <div>
                        <span className="text-cyan-300 font-bold block mb-1">
                          KEYBOARD PROTOCOLS:
                        </span>
                        <ul className="list-disc pl-4 space-y-0.5 text-cyan-200/80">
                          <li>WASD / Arrow Keys — Movement steer vectors</li>
                          <li>
                            L-Click / F, J, Z, X or Enter — Strike / fire weapons in cursor
                            direction
                          </li>
                          <li>Space / Shift — Dash thrust (grants invincibility frames)</li>
                          <li>R Key — Reload plasma bullet magazine</li>
                          <li>Q Key — Trigger Chrono Bomb (Time Freeze)</li>
                          <li>E Key — Launch Plasma Grenade</li>
                        </ul>
                      </div>
                      <div className="border-t border-cyan-500/10 pt-3">
                        <span className="text-cyan-300 font-bold block mb-2">
                          MOBILE INTEGRATION &amp; SENSITIVITY:
                        </span>
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-cyan-400/80">JOYSTICK STEER MULTIPLIER:</span>
                              <span className="text-cyan-200 font-bold font-mono">
                                {sensitivity.toFixed(2)}x
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.5"
                              max="2.0"
                              step="0.05"
                              value={sensitivity}
                              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-cyan-950/60 rounded-lg appearance-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-cyan-400/80">FIRE BUTTON OVERSIZE SCALE:</span>
                              <span className="text-cyan-200 font-bold font-mono">
                                {btnScale.toFixed(2)}x
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.5"
                              max="1.5"
                              step="0.05"
                              value={btnScale}
                              onChange={(e) => setBtnScale(parseFloat(e.target.value))}
                              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-cyan-950/60 rounded-lg appearance-none"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-cyan-400/80">UI TRANSPARENCY:</span>
                              <span className="text-cyan-200 font-bold font-mono">
                                {(controlsAlpha * 100).toFixed(0)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.2"
                              max="1.0"
                              step="0.1"
                              value={controlsAlpha}
                              onChange={(e) => setControlsAlpha(parseFloat(e.target.value))}
                              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-cyan-950/60 rounded-lg appearance-none"
                            />
                          </div>

                          <div className="flex justify-between items-center bg-cyan-950/30 p-2 rounded">
                            <span className="text-[10px] text-cyan-400/80 font-bold">
                              INVERT CONTROLS (L/R)
                            </span>
                            <button
                              onClick={() => {
                                setInvertControls((p) => !p);
                                audio.play("menu");
                              }}
                              className={`w-10 h-5 rounded-full relative transition-colors ${invertControls ? "bg-cyan-500" : "bg-cyan-950"} border border-cyan-500/50 flex items-center`}
                            >
                              <div
                                className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${invertControls ? "translate-x-5" : "translate-x-1"}`}
                              />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[10px] bg-cyan-950/40 p-2 rounded border border-cyan-500/5">
                            <span className="text-cyan-400/80 font-bold">
                              CYBERNETIC AIM ASSIST (AUTO-AIM):
                            </span>
                            <button
                              onClick={() => {
                                setAutoAim(!autoAim);
                                audio.play("pause");
                              }}
                              className="px-3 py-1 rounded border font-bold text-[9px] cursor-pointer select-none"
                              style={{
                                borderColor: autoAim ? "#00f0ff" : "rgba(255,255,255,0.15)",
                                background: autoAim ? "rgba(0,240,255,0.15)" : "transparent",
                                color: autoAim ? "#00f0ff" : "#888",
                              }}
                            >
                              {autoAim ? "LOCKED ON" : "MANUAL ONLY"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 w-full px-4">
                      <button
                        onClick={() => {
                          setMenuTab("tutorial");
                          setTutorialSlide(0);
                          audio.play("pause");
                        }}
                        className="neon-btn flex-1 select-none cursor-pointer"
                        onMouseEnter={() => audio.play("menu")}
                      >
                        VIEW MANUAL
                      </button>
                      <button
                        onClick={() => {
                          if (shopReferrer === "pause") {
                            setPhase("playing");
                            setIsPaused(true);
                          } else {
                            setMenuTab("root");
                          }
                          audio.play("pause");
                        }}
                        className="neon-btn-outline select-none cursor-pointer"
                        onMouseEnter={() => audio.play("menu")}
                      >
                        BACK
                      </button>
                    </div>
                  </div>
                )}

                {menuTab === "records" && (
                  <div className="flex flex-col items-center justify-center w-full max-w-md py-4 animate-[float-sao_0.3s_ease-out]">
                    <h3 className="text-cyan-300 tracking-[0.2em] text-sm font-bold mb-4 uppercase">
                      COGNITIVE DATA LOGS
                    </h3>
                    <div className="w-full bg-cyan-950/20 border border-cyan-500/15 p-4 rounded mb-6 text-xs text-left font-mono space-y-2.5">
                      <div className="flex justify-between">
                        <span className="text-cyan-400/70">MAX STAGE PENETRATED:</span>
                        <span className="text-cyan-200 font-bold">
                          LEVEL {highScores.maxLevel} / 4
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-cyan-400/70">MINIMUM CLEAR INTERVAL:</span>
                        <span className="text-cyan-200 font-bold">
                          {highScores.bestTime === 999
                            ? "N/A"
                            : `${highScores.bestTime.toFixed(1)}s`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-cyan-400/70">MAXIMUM SHOT ACCURACY:</span>
                        <span className="text-cyan-200 font-bold">
                          {(highScores.bestAccuracy * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-cyan-500/10 pt-2">
                        <span className="text-amber-400">TOTAL CREDITS EXTRACTED:</span>
                        <span className="text-amber-300 font-bold">
                          ¢ {highScores.totalCredits}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setMenuTab("root");
                        audio.play("pause");
                      }}
                      className="neon-btn w-full select-none cursor-pointer"
                      onMouseEnter={() => audio.play("menu")}
                    >
                      RETURN TO ROOT
                    </button>
                  </div>
                )}

                {menuTab === "tutorial" && (
                  <div className="flex flex-col items-center justify-center w-full max-w-lg py-4 animate-[float-sao_0.3s_ease-out]">
                    <div className="flex justify-between items-center w-full border-b border-cyan-500/10 pb-2 mb-4">
                      <h3 className="text-cyan-300 tracking-[0.15em] text-xs font-bold uppercase">
                        AEGIS INSTRUCTION MANUAL [SLIDE {tutorialSlide + 1} / 4]
                      </h3>
                      <button
                        onClick={begin}
                        className="text-[9px] text-fuchsia-400 hover:text-fuchsia-300 border border-fuchsia-400/30 px-2 py-0.5 rounded cursor-pointer select-none"
                        onMouseEnter={() => audio.play("menu")}
                      >
                        SKIP MANUAL
                      </button>
                    </div>

                    <div className="w-full text-left text-xs bg-cyan-950/30 border border-cyan-500/20 p-4 rounded mb-6 min-h-[160px] flex flex-col justify-between">
                      {tutorialSlide === 0 && (
                        <div>
                          <span className="text-cyan-300 font-bold block mb-1">
                            01 // BASIC NAVIGATION
                          </span>
                          <p className="text-cyan-200/80 leading-relaxed">
                            Control Aegis using standard{" "}
                            <span className="text-cyan-400 font-bold">WASD / Arrow keys</span> (or
                            the virtual Mobile Joystick). Steer with agility. Use the{" "}
                            <span className="text-fuchsia-400 font-bold">Space / Shift button</span>{" "}
                            to trigger a Dash thrust. Dashing accelerates you, impacts close-range
                            targets, and gives you crucial{" "}
                            <span className="text-fuchsia-300 font-bold">Invincibility Frames</span>{" "}
                            to slide through bullet patterns safely!
                          </p>
                        </div>
                      )}
                      {tutorialSlide === 1 && (
                        <div>
                          <span className="text-cyan-300 font-bold block mb-1">
                            02 // COMBAT SYSTEM &amp; MELEE
                          </span>
                          <p className="text-cyan-200/80 leading-relaxed">
                            Click, tap, or press the{" "}
                            <span className="text-cyan-400 font-bold">F / J key</span> to swing your{" "}
                            <span className="text-cyan-400 font-bold">Plasma Sword</span> or shoot
                            towards your target. The sword swing sweeps enemies inside a wide 120°
                            cone up to a range of 115px. Your sword swing will deflect bullets, and
                            it deals heavy damage that slices through active shield bubbles! Evolve
                            &quot;Bullet Forge&quot; in the shop to add ranged laser bullets!
                          </p>
                        </div>
                      )}
                      {tutorialSlide === 2 && (
                        <div>
                          <span className="text-cyan-300 font-bold block mb-1">
                            03 // CHESTS &amp; UPGRADE PROTOCOLS
                          </span>
                          <p className="text-cyan-200/80 leading-relaxed">
                            Mainframe corridors contain glowing{" "}
                            <span className="text-amber-400 font-bold">credits</span> and RNG{" "}
                            <span className="text-amber-400 font-bold">Loot Chests</span>. Approach
                            them to gain valuable Credits. At the end of each stage (or upon process
                            terminal failure), spend your credits in the{" "}
                            <span className="text-cyan-300 font-bold">Aegis Upgrade Shop</span> to
                            purchase extra HP capacity, Plasma Edge sword damage, bullets, magazine
                            capacity, Chrono Bombs, and Grenades!
                          </p>
                        </div>
                      )}
                      {tutorialSlide === 3 && (
                        <div>
                          <span className="text-cyan-300 font-bold block mb-1">
                            04 // THE ADAPTIVE WARDEN AI
                          </span>
                          <p className="text-cyan-200/80 leading-relaxed">
                            The Warden is a complex adaptive security intelligence. Its Strategy
                            Agent analyzes your metrics and balances group spawn compositions and
                            counters your tactics. Only Snipers can track u through walls (up to 2
                            wall pieces). Dash through shielded guards to damage them. Defeat the
                            final Core form in Level 4 to escape!
                          </p>
                        </div>
                      )}

                      <div className="flex justify-between items-center mt-4 border-t border-cyan-500/10 pt-3">
                        <button
                          disabled={tutorialSlide === 0}
                          onClick={() => {
                            setTutorialSlide((s) => s - 1);
                            audio.play("pause");
                          }}
                          className="px-3 py-1 rounded border border-cyan-500/30 text-cyan-300 disabled:opacity-30 disabled:pointer-events-none cursor-pointer text-[10px] select-none"
                          onMouseEnter={() => audio.play("menu")}
                        >
                          PREV
                        </button>
                        {tutorialSlide < 3 ? (
                          <button
                            onClick={() => {
                              setTutorialSlide((s) => s + 1);
                              audio.play("pause");
                            }}
                            className="px-3 py-1 rounded border border-cyan-500/30 text-cyan-300 cursor-pointer text-[10px] select-none"
                            onMouseEnter={() => audio.play("menu")}
                          >
                            NEXT
                          </button>
                        ) : (
                          <button
                            onClick={begin}
                            className="neon-btn text-[10px] select-none cursor-pointer"
                            onMouseEnter={() => audio.play("menu")}
                          >
                            LINK START
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Overlay>
            )}

            {phase === "loading" && (
              <Overlay>
                <div className="text-cyan-300 animate-pulse tracking-[0.4em]">
                  WARDEN ORCHESTRATING…
                </div>
              </Overlay>
            )}

            {phase === "between" && lastMetrics && (
              <Overlay>
                <h2
                  className="text-2xl text-cyan-300 tracking-widest mb-2 font-bold uppercase"
                  style={{ textShadow: "0 0 10px rgba(0,240,255,0.4)" }}
                >
                  LEVEL {lastMetrics.level} CLEARED
                </h2>
                <div className="text-xs text-cyan-200/70 grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
                  <span>Time</span>
                  <span>{(lastMetrics.timeMs / 1000).toFixed(2)}s</span>
                  <span>Accuracy</span>
                  <span>{(lastMetrics.hitAccuracy * 100).toFixed(0)}%</span>
                  <span>Dashes</span>
                  <span>{lastMetrics.dashCount}</span>
                  <span>Dash kills</span>
                  <span>{lastMetrics.killsByDash}</span>
                  <span>Shot kills</span>
                  <span>{lastMetrics.killsByShot}</span>
                  <span>HP left</span>
                  <span>{lastMetrics.hpRemaining}</span>
                </div>
                {refereeMsg && <div className="text-xs text-red-400 mb-3">{refereeMsg}</div>}
                <UpgradeShop
                  engineRef={engineRef}
                  version={upgradesVer}
                  bump={() => setUpgradesVer((v) => v + 1)}
                />
                <button onClick={nextLevel} className="neon-btn select-none cursor-pointer">
                  ENTER LEVEL {lastMetrics.level + 1}
                </button>
              </Overlay>
            )}

            {phase === "won" && (
              <Overlay>
                {wonCinematicStage === "quote" && (
                  <div className="flex flex-col items-center justify-center animate-[quote-glitch-fade_5s_ease-in-out_forwards]">
                    <h2
                      className="text-2xl md:text-3xl font-serif italic text-cyan-100 text-center tracking-wide"
                      style={{ textShadow: "0 0 15px rgba(255, 255, 255, 0.4)" }}
                    >
                      "Life is Perfect Combination of Imperfection"
                    </h2>
                  </div>
                )}
                {wonCinematicStage === "farewell" && (
                  <div className="flex flex-col items-center justify-center animate-[farewell-flow_4s_ease-in-out_forwards]">
                    <h2
                      className="text-3xl text-fuchsia-300 tracking-widest font-bold uppercase"
                      style={{ textShadow: "0 0 16px #ff00cc" }}
                    >
                      NEVER STOP WONDERING
                    </h2>
                  </div>
                )}
                {wonCinematicStage === "credits" && (
                  <div className="flex flex-col items-center justify-center animate-[float-sao_0.5s_ease-out]">
                    <h2
                      className="text-3xl text-cyan-300 tracking-widest mb-3 font-bold uppercase animate-[cyber-glitch_5s_infinite]"
                      style={{ textShadow: "0 0 16px #00f0ff" }}
                    >
                      SYSTEM PURGED
                    </h2>
                    <p className="text-cyan-200/80 text-sm mb-6 leading-relaxed text-center">
                      You outwitted The Warden and purged the main mainframe core. Security threat neutralised.
                    </p>
                    <button onClick={begin} className="neon-btn select-none cursor-pointer">
                      RUN AGAIN
                    </button>
                  </div>
                )}
              </Overlay>
            )}

            {phase === "lost" && (
              <Overlay>
                <h2
                  className="text-3xl text-red-400 tracking-widest mb-3 font-bold uppercase"
                  style={{ textShadow: "0 0 16px #ff3b64" }}
                >
                  PROCESS TERMINATED
                </h2>
                <p className="text-cyan-200/80 text-xs mb-4 max-w-sm leading-relaxed border-l-2 border-red-500 pl-2 bg-red-500/5 py-1">
                  {deathReason ?? "The Warden compiled a counter to you."}
                </p>
                <UpgradeShop
                  engineRef={engineRef}
                  version={upgradesVer}
                  bump={() => setUpgradesVer((v) => v + 1)}
                />
                <div className="flex gap-3 mt-1.5">
                  <button onClick={retry} className="neon-btn select-none cursor-pointer">
                    RETRY LEVEL
                  </button>
                  <button onClick={begin} className="neon-btn-outline select-none cursor-pointer">
                    RESTART RUN
                  </button>
                </div>
              </Overlay>
            )}
            
          </div>

          {/* Mobile controls */}
          <div
            className={`lg:hidden mt-3 flex items-center justify-between gap-3 select-none ${invertControls ? "flex-row-reverse" : ""}`}
            style={{ opacity: controlsAlpha }}
          >
            <div
              ref={joyRef}
              onPointerDown={onJoyStart}
              onPointerMove={onJoyMove}
              onPointerUp={onJoyEnd}
              onPointerCancel={onJoyEnd}
              className={`w-28 h-28 rounded-full border-2 touch-none relative flex items-center justify-center ${joyLocked ? "border-red-500/80 bg-red-500/10" : "border-cyan-500/50 bg-cyan-500/5"}`}
              style={{
                boxShadow: joyLocked
                  ? "0 0 25px rgba(255,59,100,0.4)"
                  : "0 0 20px rgba(0,240,255,0.2)",
              }}
            >
              {joyLocked && (
                <span className="text-[10px] text-red-400 font-bold tracking-widest animate-pulse pointer-events-none">
                  LOCKED
                </span>
              )}
            </div>
            <div
              className="grid grid-cols-2 gap-2"
              style={{
                transform: `scale(${btnScale})`,
                transformOrigin: invertControls ? "left center" : "right center",
              }}
            >
              <button
                onPointerDown={() => engineRef.current?.pressAction("dash")}
                className="w-16 h-16 rounded-full border-2 border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-200 font-bold text-xs select-none cursor-pointer"
                onMouseEnter={() => audio.play("menu")}
              >
                DASH
              </button>
              <button
                onPointerDown={() => engineRef.current?.pressAction("shoot")}
                className="w-16 h-16 rounded-full border-2 border-emerald-400/60 bg-emerald-500/10 text-emerald-200 font-bold text-xs select-none cursor-pointer"
                onMouseEnter={() => audio.play("menu")}
              >
                FIRE
              </button>
              <button
                onPointerDown={() => {
                  if (engineRef.current)
                    engineRef.current.weaponMode =
                      engineRef.current.weaponMode === "sword" ? "gun" : "sword";
                  audio.play("menu");
                }}
                className="w-16 h-16 rounded-full border-2 border-indigo-400/60 bg-indigo-500/10 text-indigo-200 font-bold text-[10px] select-none cursor-pointer"
                onMouseEnter={() => audio.play("menu")}
              >
                SWAP WPN
              </button>
              <button
                onPointerDown={() => engineRef.current?.pressAction("freeze")}
                className="w-16 h-16 rounded-full border-2 border-sky-400/60 bg-sky-500/10 text-sky-200 font-bold text-xs select-none cursor-pointer"
                onMouseEnter={() => audio.play("menu")}
              >
                ❄ {freezeCharges}
              </button>
              <button
                onPointerDown={() => engineRef.current?.pressAction("grenade")}
                className="w-16 h-16 rounded-full border-2 border-amber-400/60 bg-amber-500/10 text-amber-200 font-bold text-xs select-none cursor-pointer"
                onMouseEnter={() => audio.play("menu")}
              >
                ✸ {grenadeCharges}
              </button>
            </div>
          </div>
        </div>

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
        @keyframes float-sao {
          0% { transform: translateY(-20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes fade-in-out {
          0% { opacity: 0; filter: blur(8px); }
          15%, 85% { opacity: 1; filter: blur(0); }
          100% { opacity: 0; filter: blur(8px); }
        }
        @keyframes quote-glitch-fade {
          0% { opacity: 0; filter: blur(12px); transform: scale(0.95); }
          10%, 90% { opacity: 1; filter: blur(0); transform: scale(1); }
          12% { clip-path: inset(20% 0 40% 0); }
          14% { clip-path: inset(0 0 0 0); }
          45% { clip-path: inset(40% 0 10% 0); }
          47% { clip-path: inset(0 0 0 0); }
          100% { opacity: 0; filter: blur(12px); transform: scale(1.05); }
        }
        @keyframes farewell-flow {
          0% { opacity: 0; filter: blur(10px); transform: scale(0.9); }
          25% { opacity: 1; filter: blur(0); transform: scale(1); }
          75% { opacity: 1; filter: blur(0); transform: scale(1); }
          100% { opacity: 0; filter: blur(10px); transform: scale(1.1); }
        }
        @keyframes cyber-glitch {
          0% { clip-path: inset(40% 0 61% 0); }
          20% { clip-path: inset(92% 0 1% 0); }
          40% { clip-path: inset(25% 0 58% 0); }
          60% { clip-path: inset(76% 0 5% 0); }
          80% { clip-path: inset(3% 0 81% 0); }
          100% { clip-path: inset(50% 0 33% 0); }
        }
        .sao-node {
          background: rgba(4, 6, 14, 0.9);
          border: 1px solid rgba(0, 240, 255, 0.35);
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.2), inset 0 0 8px rgba(0, 240, 255, 0.1);
          clip-path: polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%);
          transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .sao-node:hover {
          background: rgba(0, 240, 255, 0.18);
          border-color: #00f0ff;
          box-shadow: 0 0 25px rgba(0, 240, 255, 0.45), inset 0 0 12px rgba(255, 255, 255, 0.15);
          transform: scale(1.03) translateX(3px);
        }
        
        /* Portrait rotation warning overlay */
        .portrait-warning {
          display: none;
        }
        @media (orientation: portrait) and (max-width: 1024px) {
          .portrait-warning {
            position: fixed;
            inset: 0;
            background: #05060e;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #00f0ff;
            font-family: monospace;
            text-align: center;
            padding: 20px;
          }
          .portrait-warning h2 {
            font-size: 1.25rem;
            letter-spacing: 0.15em;
            font-weight: bold;
            margin-top: 15px;
            color: #00f0ff;
            text-shadow: 0 0 10px rgba(0, 240, 255, 0.6);
          }
          .phone-container {
            width: 45px;
            height: 75px;
            border: 3px solid #00f0ff;
            border-radius: 8px;
            position: relative;
            box-shadow: 0 0 15px rgba(0, 240, 255, 0.4);
          }
          .phone-screen {
            position: absolute;
            top: 4px;
            bottom: 8px;
            left: 3px;
            right: 3px;
            background: rgba(0, 240, 255, 0.1);
          }
          .phone-home-button {
            position: absolute;
            bottom: 2px;
            left: 50%;
            transform: translateX(-50%);
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: #00f0ff;
          }
          .rotate-phone-animation {
            animation: rotate-phone 2s infinite ease-in-out;
          }
        }
        @keyframes rotate-phone {
          0%, 100% {
            transform: rotate(0deg);
          }
          50% {
            transform: rotate(-90deg);
          }
        }
        
        /* Render canvas with razor-sharp anti-blur pixelated styling */
        canvas {
          image-rendering: -moz-crisp-edges;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      `}</style>
    </div>
  );
}

interface UpgradeShopProps {
  engineRef: React.MutableRefObject<GameEngine | null>;
  version: number;
  bump: () => void;
}

function UpgradeShop({ engineRef, version, bump }: UpgradeShopProps) {
  const g = engineRef.current;
  if (!g) return null;

  const upgrades = g.upgrades;
  const currency = g.currency;

  const totalUpgrades = Object.values(upgrades).reduce((a, b) => a + b, 0);

  const buy = (id: UpgradeId, cost: number) => {
    if (totalUpgrades >= 5) {
      audio.play("upgradeFail");
      return;
    }
    if (g.currency >= cost && upgrades[id] < UPGRADES.find((u) => u.id === id)!.max) {
      g.currency -= cost;
      g.upgrades[id]++;
      audio.play("upgradeBuy");
      g.resetPlayer(false);
      bump();
    } else {
      audio.play("upgradeFail");
    }
  };

  return (
    <div className="w-full max-w-[780px] bg-[#04060e]/95 border border-cyan-500/35 rounded-lg p-5 mb-4 backdrop-blur-md text-left shadow-[0_0_30px_rgba(0,240,255,0.05)]">
      <div className="flex justify-between items-center mb-4 border-b border-cyan-500/20 pb-3">
        <div className="flex flex-col text-left">
          <span className="text-cyan-400 font-mono tracking-[0.2em] text-[11px] font-bold">
            // SYSTEM INTEGRATION PROTOCOL // AEGIS SHOP
          </span>
          <span className="text-[9px] text-fuchsia-400 font-bold uppercase mt-1 font-mono">
            TOTAL SYNCED UPGRADES: {totalUpgrades} / 5
          </span>
        </div>
        <span
          className="text-amber-400 font-mono font-bold text-sm"
          style={{ textShadow: "0 0 10px rgba(255, 170, 68, 0.4)" }}
        >
          ¢ {currency}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[380px] overflow-y-auto pr-1">
        {UPGRADES.map((up) => {
          const lvl = upgrades[up.id] ?? 0;
          const isMax = lvl >= up.max;
          const cost = up.cost(lvl);
          const reachedGlobalLimit = totalUpgrades >= 5;
          const canAfford = currency >= cost;
          const disabled = isMax || reachedGlobalLimit || !canAfford;

          let btnText = `BUY [¢${cost}]`;
          if (isMax) btnText = "MAX PROTOCOL";
          else if (reachedGlobalLimit) btnText = "LIMIT REACHED (5/5)";

          return (
            <div
              key={up.id}
              className="relative flex flex-col p-4 rounded-lg bg-cyan-950/15 border border-cyan-500/20 hover:border-cyan-400/50 hover:bg-cyan-950/25 transition-all duration-300 shadow-[0_0_15px_rgba(0,240,255,0.01)] hover:shadow-[0_0_20px_rgba(0,240,255,0.06)]"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full font-bold text-lg bg-cyan-950/40 border flex items-center justify-center transition-all"
                  style={{
                    borderColor: `${up.color}44`,
                    color: up.color,
                    boxShadow: `0 0 12px ${up.color}25, inset 0 0 8px ${up.color}15`,
                  }}
                >
                  {up.icon}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[11px] font-bold text-cyan-200 tracking-wide uppercase">
                    {up.name}
                  </span>
                  <span className="text-[8px] font-mono text-cyan-400/80 mt-0.5">
                    LVL {lvl} / {up.max}
                  </span>
                </div>
              </div>

              {/* Progress Dots */}
              <div className="flex gap-1 mt-2 mb-1.5 select-none">
                {Array.from({ length: up.max }).map((_, i) => (
                  <span
                    key={i}
                    className="text-[10px] leading-none"
                    style={{ color: i < lvl ? up.color : "#1e293b" }}
                  >
                    ●
                  </span>
                ))}
              </div>

              {/* Description */}
              <span className="text-[9px] text-cyan-300/70 leading-relaxed mt-1 flex-1 min-h-[32px]">
                {up.desc}
              </span>

              {/* Purchase button */}
              <button
                disabled={disabled}
                onClick={() => buy(up.id, cost)}
                className="w-full mt-3 py-1.5 rounded text-[10px] font-mono font-bold tracking-wider transition-all duration-200 cursor-pointer select-none border"
                style={{
                  background: isMax || reachedGlobalLimit ? "transparent" : canAfford ? `${up.color}25` : "transparent",
                  color: isMax || reachedGlobalLimit ? "#475569" : canAfford ? up.color : "#ff3b64",
                  borderColor: isMax || reachedGlobalLimit ? "#1e293b" : canAfford ? up.color : "#ff3b64",
                  boxShadow: !isMax && !reachedGlobalLimit && canAfford ? `0 0 10px ${up.color}25` : "none",
                }}
                onMouseEnter={() => audio.play("menu")}
              >
                {btnText}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 sm:px-6 py-4 bg-black/85 backdrop-blur-sm rounded-md z-40 overflow-y-auto">
      <div className="my-auto flex flex-col items-center justify-center w-full">{children}</div>
    </div>
  );
}

function formatTime(s: number) {
  const sec = Math.max(0, Math.ceil(s));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
