import React, { useState } from "react";
import {
  Terminal,
  Shield,
  Activity,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Cpu,
} from "lucide-react";

export interface TraceEntry {
  id: string;
  agent: "strategy" | "narrative" | "referee" | "system";
  action: string;
  decision: string;
  reasoning: string[];
  timestamp: string;
  isThinking?: boolean;
}

interface AgentTracePanelProps {
  traces: TraceEntry[];
  onClear?: () => void;
}

export function AgentTracePanel({ traces, onClear }: AgentTracePanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  const getAgentColor = (agent: TraceEntry["agent"]) => {
    switch (agent) {
      case "strategy":
        return {
          bg: "bg-[#10b981]/10",
          border: "border-emerald-500/30",
          text: "text-emerald-400",
          glow: "shadow-[0_0_15px_rgba(16,185,129,0.2)]",
          badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
          icon: <Activity className="w-3.5 h-3.5" />,
        };
      case "narrative":
        return {
          bg: "bg-[#d946ef]/10",
          border: "border-fuchsia-500/30",
          text: "text-fuchsia-400",
          glow: "shadow-[0_0_15px_rgba(217,70,239,0.2)]",
          badge: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40",
          icon: <MessageSquare className="w-3.5 h-3.5" />,
        };
      case "referee":
        return {
          bg: "bg-[#3b82f6]/10",
          border: "border-blue-500/30",
          text: "text-blue-400",
          glow: "shadow-[0_0_15px_rgba(59,130,246,0.2)]",
          badge: "bg-blue-500/20 text-blue-300 border-blue-500/40",
          icon: <Shield className="w-3.5 h-3.5" />,
        };
      case "system":
      default:
        return {
          bg: "bg-cyan-950/20",
          border: "border-cyan-500/20",
          text: "text-cyan-400",
          glow: "shadow-[0_0_10px_rgba(6,182,212,0.15)]",
          badge: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
          icon: <Terminal className="w-3.5 h-3.5" />,
        };
    }
  };

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 w-full max-w-[380px] sm:max-w-[420px] transition-all duration-300 ${
        isOpen ? "h-[450px]" : "h-[48px]"
      } flex flex-col`}
    >
      {/* Panel Container with Glassmorphism */}
      <div
        className="w-full h-full bg-[#050713]/85 backdrop-blur-md border border-cyan-500/30 rounded-lg flex flex-col overflow-hidden transition-all"
        style={{
          boxShadow: "0 0 30px rgba(0,240,255,0.15), inset 0 0 15px rgba(0,240,255,0.05)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 to-blue-950/40 cursor-pointer select-none"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              Agent Trace Core
            </span>
            {traces.some((t) => t.isThinking) && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {onClear && isOpen && (
              <button
                onClick={onClear}
                className="text-[10px] text-cyan-400/60 hover:text-cyan-300 hover:border-cyan-400/40 border border-cyan-500/20 px-1.5 py-0.5 rounded transition-all bg-cyan-950/35"
              >
                CLEAR
              </button>
            )}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-cyan-400 hover:text-cyan-300 transition-all"
            >
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Content Area */}
        {isOpen && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-cyan-500/20 scrollbar-track-transparent">
            {traces.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-cyan-500/40 p-4">
                <Cpu className="w-8 h-8 mb-2 opacity-30 animate-pulse" />
                <p className="text-[11px] uppercase tracking-widest">Warden Core Idle</p>
                <p className="text-[9px] mt-1 text-cyan-600/50">
                  Begin run to initiate orchestration trace
                </p>
              </div>
            ) : (
              traces.map((trace) => {
                const styles = getAgentColor(trace.agent);
                return (
                  <div
                    key={trace.id}
                    className={`p-3 rounded border ${styles.bg} ${styles.border} ${styles.glow} transition-all duration-300 relative group overflow-hidden`}
                  >
                    {/* Glowing side accent */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-[3px] ${
                        trace.agent === "strategy"
                          ? "bg-emerald-500"
                          : trace.agent === "narrative"
                            ? "bg-fuchsia-500"
                            : trace.agent === "referee"
                              ? "bg-blue-500"
                              : "bg-cyan-500"
                      }`}
                    />

                    {/* Meta header */}
                    <div className="flex items-center justify-between mb-1.5 pl-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${styles.badge}`}
                        >
                          {styles.icon}
                          {trace.agent.toUpperCase()}
                        </span>
                        {trace.isThinking && (
                          <span className="text-[9px] text-cyan-400 animate-pulse font-bold tracking-widest">
                            (THINKING...)
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-cyan-500/40">{trace.timestamp}</span>
                    </div>

                    {/* Action & Decision */}
                    <div className="pl-1 mb-2">
                      <h4 className="text-[11px] font-semibold text-cyan-100 leading-snug">
                        {trace.action}
                      </h4>
                      <p className={`text-[10px] mt-0.5 ${styles.text} font-bold tracking-wide`}>
                        Decision: {trace.decision}
                      </p>
                    </div>

                    {/* Reasoning list */}
                    {trace.reasoning && trace.reasoning.length > 0 && (
                      <div className="pl-1.5 border-l border-cyan-500/10 space-y-1">
                        {trace.reasoning.map((step, idx) => (
                          <div key={idx} className="flex gap-1.5 items-start">
                            <span className={`text-[9px] ${styles.text} mt-0.5`}>›</span>
                            <p className="text-[9px] text-cyan-300/80 leading-normal font-sans">
                              {step}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
