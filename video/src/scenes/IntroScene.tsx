import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Img,
} from "remotion";
import { Sparkles, Zap, Shield } from "lucide-react";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring animations
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.6, stiffness: 100 },
  });

  const titleProgress = spring({
    frame: frame - 15,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  const titleY = interpolate(titleProgress, [0, 1], [40, 0]);
  const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);

  const badgeProgress = spring({
    frame: frame - 30,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  // Outro transition (last 20 frames)
  const exitOpacity = interpolate(frame, [125, 145], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitScale = interpolate(frame, [125, 145], [1, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      className="items-center justify-center flex flex-col px-16 text-center select-none"
      style={{
        opacity: exitOpacity,
        transform: `scale(${exitScale})`,
      }}
    >
      {/* Top Floating Pill */}
      <div
        className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-md mb-8 text-indigo-300 text-sm font-medium tracking-wide shadow-lg shadow-indigo-500/10"
        style={{
          opacity: interpolate(frame, [5, 25], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transform: `translateY(${interpolate(frame, [5, 25], [-20, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px)`,
        }}
      >
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <span>Open-Source • Private • Lightning Fast</span>
      </div>

      {/* Main Logo with Ambient Glow */}
      <div
        className="relative mb-6"
        style={{
          transform: `scale(${logoScale})`,
        }}
      >
        {/* Glow behind logo */}
        <div className="absolute inset-0 rounded-3xl bg-indigo-500/30 blur-2xl transform scale-110" />

        <div className="relative w-28 h-28 rounded-3xl overflow-hidden border-2 border-indigo-400/40 shadow-2xl bg-[#0f172a] p-2 flex items-center justify-center">
          <Img
            src={staticFile("logo.jpg")}
            className="w-full h-full object-cover rounded-2xl"
            onError={(e) => {
              // fallback if logo fails
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <h1 className="text-7xl font-extrabold tracking-tight mb-4">
          <span className="bg-gradient-to-r from-white via-indigo-100 to-indigo-400 bg-clip-text text-transparent drop-shadow-sm">
            Reqspace
          </span>
        </h1>
        <p className="text-2xl text-slate-300 font-light max-w-2xl mx-auto leading-relaxed">
          The Modern, Lightweight API Testing Platform Built for Developers
        </p>
      </div>

      {/* Feature Tags Row */}
      <div
        className="flex items-center justify-center gap-4 mt-10"
        style={{
          opacity: badgeProgress,
          transform: `translateY(${interpolate(badgeProgress, [0, 1], [20, 0])}px)`,
        }}
      >
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 text-sm">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Zero Bloat</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 text-sm">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>100% Self-Hosted</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 text-sm">
          <span className="text-indigo-400 font-bold font-mono">{"{ }"}</span>
          <span>SQLite / Postgres / MySQL</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
