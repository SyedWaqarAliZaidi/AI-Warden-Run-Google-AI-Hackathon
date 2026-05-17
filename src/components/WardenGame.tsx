import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GameEngine, VIEW_W, VIEW_H, type GameEvent } from "@/game/engine";
import { render } from "@/game/render";
import {
  requestWardenConfig,
  validateRun,
  type LevelConfig,
  type PlayerMetrics,
} from "@/lib/warden.functions";

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
  const [currentLevel, setCurrentLevel] = useState(1);
  const [hp, setHp] = useState(100);
  const [countdown, setCountdown] = useState(0);
  const [engineState, setEngineState] = useState<"countdown" | "playing" | "victory" | "dead">("countdown");
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [lastMetrics, setLastMetrics] = useState<PlayerMetrics | null>(null);
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [refereeMsg, setRefereeMsg] = useState<string | null>(null);
  const traceIdRef = useRef(0);

  const callWarden = useServerFn(requestWardenConfig);
  const callReferee = useServerFn(validateRun);

  const pushTrace = useCallback((msg: string, kind: TraceLine["kind"] = "trace") => {
    setTrace((t) => {
      const next = [...t, { id: ++traceIdRef.current, msg, kind }];
      return next.slice(-40);
    });
  }, []);

  // engine init
  useEffect(() => {
    if (engineRef.current) return;
    const g = new GameEngine();
    g.onEvent = (e: GameEvent) => {
      if (e.type === "trace") pushTrace(e.msg, "trace");
      else if (e.type === "warden_taunt") pushTrace(`THE WARDEN: "${e.msg}"`, "taunt");
      else if (e.type === "level_cleared") handleLevelCleared(e.metrics);
      else if (e.type === "death") handleDeath();
    };
    engineRef.current = g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RAF loop
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
        }
        render(ctx, g);
        if (phase === "playing") setHp(Math.round(g.player.hp));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // input
  useEffect(() => {
    const g = engineRef.current;
    if (!g) return;
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (k === " " || k === "shift") g.pressAction("dash");
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

  // pointer (mouse + touch shoot)
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

  // start a level
  const startLevel = useCallback(
    async (lvl: number, prevMetrics: PlayerMetrics | null) => {
      setPhase("loading");
      pushTrace(`Warden orchestrating Level ${lvl}…`, "system");
      try {
        const cfg = await callWarden({ data: { level: lvl, metrics: prevMetrics } });
        setConfig(cfg);
        setCurrentLevel(lvl);
        const g = engineRef.current!;
        g.loadLevel(cfg);
        setHp(g.player.hp);
        setPhase("playing");
      } catch (err) {
        pushTrace(`Warden unreachable: ${(err as Error).message}`, "system");
        setPhase("menu");
      }
    },
    [callWarden, pushTrace],
  );

  const handleLevelCleared = async (metrics: PlayerMetrics) => {
    setLastMetrics(metrics);
    setPhase("between");
    pushTrace(
      `Level ${metrics.level} cleared in ${(metrics.timeMs / 1000).toFixed(1)}s — acc ${(metrics.hitAccuracy * 100).toFixed(0)}%`,
      "system",
    );
    try {
      const v = await callReferee({ data: { metrics } });
      if (!v.valid) {
        setRefereeMsg(`Referee flagged: ${v.reasons.join(", ")}`);
        pushTrace(`REFEREE: invalid run — ${v.reasons.join(", ")}`, "system");
      } else {
        setRefereeMsg(null);
        pushTrace("REFEREE: run validated ✓", "system");
      }
    } catch {
      /* ignore */
    }
    if (metrics.level >= 4) {
      setPhase("won");
    }
  };

  const handleDeath = () => {
    setPhase("lost");
    pushTrace("Aegis terminated. The Warden prevails.", "system");
  };

  const begin = () => {
    setTrace([]);
    setLastMetrics(null);
    setRefereeMsg(null);
    startLevel(1, null);
  };

  const nextLevel = () => {
    if (lastMetrics) startLevel(lastMetrics.level + 1, lastMetrics);
  };

  const retry = () => {
    setTrace([]);
    setLastMetrics(null);
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

  return (
    <div className="min-h-screen w-full bg-[#05060e] text-cyan-100 font-mono">
      <header className="border-b border-cyan-500/30 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl tracking-[0.3em] text-cyan-300" style={{ textShadow: "0 0 12px #00f0ff" }}>
          THE WARDEN&apos;S LABYRINTH
        </h1>
        <div className="text-xs text-cyan-400/70">{LEVEL_NAMES[currentLevel]}</div>
      </header>

      <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-[1400px] mx-auto">
        {/* Game canvas */}
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

            {/* HP bar */}
            <div className="absolute top-2 left-2 right-2 flex items-center gap-2 pointer-events-none">
              <span className="text-xs text-cyan-300">AEGIS</span>
              <div className="flex-1 h-2 bg-cyan-900/40 border border-cyan-500/40 rounded-sm overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${(hp / 100) * 100}%`,
                    background: hp > 40 ? "#00f0ff" : "#ff3b64",
                    boxShadow: `0 0 8px ${hp > 40 ? "#00f0ff" : "#ff3b64"}`,
                  }}
                />
              </div>
              <span className="text-xs tabular-nums text-cyan-300">{hp}</span>
            </div>

            {/* Overlays */}
            {phase === "playing" && engineState === "countdown" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[10px] tracking-[0.4em] text-cyan-300/70 mb-2">SYSTEM SYNC</div>
                <div
                  className="text-7xl font-bold text-cyan-200 tabular-nums"
                  style={{ textShadow: "0 0 24px #00f0ff" }}
                >
                  {Math.max(1, Math.ceil(countdown))}
                </div>
              </div>
            )}
            {phase === "playing" && engineState === "victory" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
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
                <h2 className="text-3xl tracking-widest text-cyan-300 mb-3" style={{ textShadow: "0 0 16px #00f0ff" }}>
                  AEGIS // BOOT
                </h2>
                <p className="text-cyan-100/80 max-w-md text-sm mb-6 leading-relaxed">
                  You are a rogue AI. Escape the mainframe through 4 levels. The Warden — an adaptive AI dungeon master —
                  reshapes each level based on how you played the last.
                </p>
                <ul className="text-xs text-cyan-200/70 mb-6 space-y-1">
                  <li>WASD / arrows — move</li>
                  <li>Mouse / tap — aim &amp; shoot</li>
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
                <p className="text-cyan-200/80 text-sm mb-6">The Warden compiled a counter to you.</p>
                <div className="flex gap-3">
                  <button onClick={retry} className="neon-btn">RETRY LEVEL</button>
                  <button onClick={begin} className="neon-btn-outline">RESTART RUN</button>
                </div>
              </Overlay>
            )}
          </div>

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
            <button
              onPointerDown={() => engineRef.current?.pressAction("dash")}
              className="w-20 h-20 rounded-full border-2 border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-200 font-bold tracking-widest"
              style={{ boxShadow: "0 0 20px rgba(255,0,200,0.3)" }}
            >
              DASH
            </button>
          </div>
        </div>

        {/* Agent trace panel */}
        <aside className="w-full lg:w-[360px] border border-cyan-500/30 rounded-md bg-cyan-500/5 p-3 flex flex-col">
          <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400/70 mb-2">
            // Warden Agent Trace
          </div>
          <div className="flex-1 overflow-y-auto text-xs space-y-1 max-h-[500px]">
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
          {config && (
            <div className="mt-3 pt-3 border-t border-cyan-500/20 text-[10px] text-cyan-300/70 grid grid-cols-2 gap-y-0.5">
              <span>Enemies</span><span className="text-cyan-200">{config.enemyCount}</span>
              <span>Speed</span><span className="text-cyan-200">{config.enemySpeed}</span>
              <span>HP</span><span className="text-cyan-200">{config.enemyHp}</span>
              <span>Pattern</span><span className="text-cyan-200">{config.spawnPattern}</span>
              <span>Hazards</span><span className="text-cyan-200">{config.hazards.join(", ") || "none"}</span>
              <span>Difficulty</span><span className="text-cyan-200">{config.difficulty.toFixed(2)}×</span>
            </div>
          )}
        </aside>
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
      `}</style>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-black/70 backdrop-blur-sm rounded-md">
      {children}
    </div>
  );
}