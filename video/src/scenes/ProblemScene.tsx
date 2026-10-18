import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AlertTriangle, CheckCircle2, Cpu, Zap } from "lucide-react";

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animations
  const questionSpring = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  const cardsTransition = spring({
    frame: frame - 40,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  // Outro transition
  const exitOpacity = interpolate(frame, [140, 160], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitScale = interpolate(frame, [140, 160], [1, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      className="items-center justify-center flex flex-col px-20 text-center select-none"
      style={{
        opacity: exitOpacity,
        transform: `scale(${exitScale})`,
      }}
    >
      {/* Top Question */}
      <div
        className="max-w-4xl mx-auto mb-12"
        style={{
          opacity: questionSpring,
          transform: `translateY(${interpolate(questionSpring, [0, 1], [30, 0])}px)`,
        }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-semibold mb-6">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span>The API Tooling Dilemma</span>
        </div>
        <h2 className="text-5xl font-extrabold text-white tracking-tight">
          Tired of slow, bloated API clients eating your resources?
        </h2>
      </div>

      {/* Comparison Grid: Old Way vs Reqspace Way */}
      <div
        className="grid grid-cols-2 gap-8 max-w-5xl w-full"
        style={{
          opacity: cardsTransition,
          transform: `translateY(${interpolate(cardsTransition, [0, 1], [40, 0])}px)`,
        }}
      >
        {/* Legacy / Heavy Card */}
        <div className="p-8 rounded-2xl bg-rose-950/20 border border-rose-500/20 backdrop-blur-md flex flex-col text-left relative overflow-hidden">
          <div className="absolute top-0 right-0 px-4 py-1 bg-rose-500/20 text-rose-300 text-xs font-mono rounded-bl-xl border-l border-b border-rose-500/30">
            TRADITIONAL TOOLS
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-rose-200">Heavy & Bloated</h3>
              <p className="text-xs text-rose-400/80">Gigabytes of RAM & slow cold starts</p>
            </div>
          </div>
          <ul className="space-y-3.5 text-sm text-slate-300">
            <li className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">✕</span>
              Forced cloud accounts & sync lock-in
            </li>
            <li className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">✕</span>
              Aggressive paywalls on team features
            </li>
            <li className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">✕</span>
              Opaque telemetry & privacy concerns
            </li>
          </ul>
        </div>

        {/* The Reqspace Way Card */}
        <div
          className="p-8 rounded-2xl bg-indigo-950/30 border border-indigo-500/40 backdrop-blur-md flex flex-col text-left relative overflow-hidden"
          style={{
            boxShadow: "0 0 30px -5px rgba(99, 102, 241, 0.25)",
          }}
        >
          <div className="absolute top-0 right-0 px-4 py-1 bg-indigo-500/30 text-indigo-200 text-xs font-mono font-bold rounded-bl-xl border-l border-b border-indigo-500/40">
            REQSPACE
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center">
              <Zap className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Fast, Native & Private</h3>
              <p className="text-xs text-indigo-300">Starts in milliseconds, respects your device</p>
            </div>
          </div>
          <ul className="space-y-3.5 text-sm text-slate-200 font-medium">
            <li className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              100% Open-Source & Self-Hosted
            </li>
            <li className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              Runs natively in Web or Desktop (Electron)
            </li>
            <li className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              Your data stays in your database (SQLite/PG/MySQL)
            </li>
          </ul>
        </div>
      </div>
    </AbsoluteFill>
  );
};
