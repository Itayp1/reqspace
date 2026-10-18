import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Sparkles, Star, Award, Zap } from "lucide-react";

export const KidsIntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bouncy entrance springs
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 11, mass: 0.7, stiffness: 120 },
  });

  const titleProgress = spring({
    frame: frame - 12,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  const badgesProgress = spring({
    frame: frame - 25,
    fps,
    config: { damping: 14, mass: 0.9 },
  });

  // Scene exit fade
  const exitOpacity = interpolate(frame, [105, 120], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitScale = interpolate(frame, [105, 120], [1, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      className="items-center justify-center flex flex-col px-12 text-center select-none"
      style={{
        opacity: exitOpacity,
        transform: `scale(${exitScale})`,
      }}
      dir="rtl"
    >
      {/* Top Floating Badge */}
      <div
        className="flex items-center gap-2 px-5 py-2 rounded-full border border-pink-400/30 bg-pink-500/10 backdrop-blur-md mb-8 text-pink-300 text-base font-bold shadow-lg shadow-pink-500/10"
        style={{
          opacity: interpolate(frame, [5, 20], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(frame, [5, 20], [-25, 0], { extrapolateRight: "clamp" })}px)`,
        }}
      >
        <Sparkles className="w-5 h-5 text-yellow-400 animate-spin" />
        <span>מערכת חיזוק התנהגות ומשימות לילדים ולכל המשפחה</span>
        <Sparkles className="w-5 h-5 text-yellow-400 animate-spin" />
      </div>

      {/* Main App Logo Icon */}
      <div
        className="relative mb-6"
        style={{
          transform: `scale(${logoScale}) rotate(${interpolate(logoScale, [0, 1], [-15, 0])}deg)`,
        }}
      >
        {/* Glowing aura */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-400 to-pink-500 blur-3xl opacity-60 transform scale-125" />

        <div className="relative w-36 h-36 rounded-3xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-1 shadow-2xl border-2 border-white/30 flex items-center justify-center">
          <div className="w-full h-full rounded-[22px] bg-[#121832] flex flex-col items-center justify-center gap-1">
            <span className="text-6xl drop-shadow-md">🏆</span>
            <div className="flex gap-1 text-amber-400 text-lg">
              <span>★</span>
              <span>★</span>
              <span>★</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Title & Subtitle */}
      <div
        style={{
          opacity: titleProgress,
          transform: `translateY(${interpolate(titleProgress, [0, 1], [30, 0])}px)`,
        }}
      >
        <h1 className="text-7xl font-black tracking-tight mb-4 text-white drop-shadow-lg">
          <span className="bg-gradient-to-r from-amber-300 via-pink-400 to-indigo-300 bg-clip-text text-transparent">
            Kids Ranking
          </span>
        </h1>
        <p className="text-3xl text-slate-200 font-bold max-w-3xl mx-auto leading-relaxed drop-shadow">
          הופכים את משימות היום-יום להרפתקה כיפית ומלאת כוכבים! 🌟
        </p>
      </div>

      {/* Feature Highlights Pills */}
      <div
        className="flex items-center justify-center gap-5 mt-10"
        style={{
          opacity: badgesProgress,
          transform: `translateY(${interpolate(badgesProgress, [0, 1], [25, 0])}px)`,
        }}
      >
        <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-indigo-950/70 border border-indigo-500/40 text-indigo-200 font-semibold text-lg shadow-lg">
          <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
          <span>משימות וצבירת כוכבים</span>
        </div>

        <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-purple-950/70 border border-purple-500/40 text-purple-200 font-semibold text-lg shadow-lg">
          <Zap className="w-5 h-5 text-emerald-400 fill-emerald-400" />
          <span>חיבור סופר-מהיר ב-QR</span>
        </div>

        <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-pink-950/70 border border-pink-500/40 text-pink-200 font-semibold text-lg shadow-lg">
          <Award className="w-5 h-5 text-pink-400 fill-pink-400" />
          <span>חנות פרסים אישית</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
