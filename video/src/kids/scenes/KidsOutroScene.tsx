import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Confetti } from "../components/Confetti";
import { Sparkles, Star, Award, Zap } from "lucide-react";

export const KidsOutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance springs
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 11, mass: 0.7, stiffness: 120 },
  });

  const titleProgress = spring({
    frame: frame - 15,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  const cardsProgress = spring({
    frame: frame - 28,
    fps,
    config: { damping: 14, mass: 0.9 },
  });

  const ctaProgress = spring({
    frame: frame - 42,
    fps,
    config: { damping: 12, mass: 0.8 },
  });

  return (
    <AbsoluteFill
      className="items-center justify-center flex flex-col px-12 text-center select-none"
      dir="rtl"
    >
      <Confetti triggerFrame={5} count={40} />

      {/* Floating Pill Tag */}
      <div
        className="flex items-center gap-2 px-5 py-2 rounded-full border border-amber-400/40 bg-amber-500/15 backdrop-blur-md mb-6 text-amber-300 text-base font-black shadow-lg shadow-amber-500/10"
        style={{
          opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(frame, [0, 15], [-20, 0], { extrapolateRight: "clamp" })}px)`,
        }}
      >
        <Sparkles className="w-5 h-5 text-amber-400 fill-amber-400" />
        <span>הדרך המושלמת להרגלים טובים בבית!</span>
        <Sparkles className="w-5 h-5 text-amber-400 fill-amber-400" />
      </div>

      {/* Hero Badge Avatar */}
      <div
        className="relative mb-6"
        style={{
          transform: `scale(${logoScale})`,
        }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-amber-400 blur-3xl opacity-60 transform scale-125" />

        <div className="relative w-32 h-32 rounded-3xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-1 shadow-2xl border-2 border-white/30 flex items-center justify-center">
          <div className="w-full h-full rounded-[22px] bg-[#121832] flex flex-col items-center justify-center gap-1 text-5xl">
            👨‍👩‍👧‍👦
          </div>
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          opacity: titleProgress,
          transform: `translateY(${interpolate(titleProgress, [0, 1], [30, 0])}px)`,
        }}
      >
        <h2 className="text-6xl font-black tracking-tight mb-3 text-white">
          <span className="bg-gradient-to-r from-amber-300 via-pink-400 to-indigo-300 bg-clip-text text-transparent">
            Kids Ranking
          </span>
        </h2>
        <p className="text-2xl text-slate-200 font-bold max-w-2xl mx-auto leading-relaxed">
          מחברים הורים וילדים סביב אחריות, עצמאות והנאה משותפת!
        </p>
      </div>

      {/* 3 Pillars Summary */}
      <div
        className="flex items-center justify-center gap-6 mt-8"
        style={{
          opacity: cardsProgress,
          transform: `translateY(${interpolate(cardsProgress, [0, 1], [25, 0])}px)`,
        }}
      >
        <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-[#162038]/80 border border-indigo-400/40 text-slate-200 shadow-xl">
          <Zap className="w-6 h-6 text-emerald-400 fill-emerald-400" />
          <span className="font-extrabold text-base">חיבור מיידי ב-QR</span>
        </div>

        <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-[#162038]/80 border border-purple-400/40 text-slate-200 shadow-xl">
          <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
          <span className="font-extrabold text-base">משימות וצבירת כוכבים</span>
        </div>

        <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-[#162038]/80 border border-pink-400/40 text-slate-200 shadow-xl">
          <Award className="w-6 h-6 text-pink-400 fill-pink-400" />
          <span className="font-extrabold text-base">חנות פרסים מעצימה</span>
        </div>
      </div>

      {/* Call to Action Button */}
      <div
        className="mt-10"
        style={{
          opacity: ctaProgress,
          transform: `scale(${interpolate(ctaProgress, [0, 1], [0.85, 1])})`,
        }}
      >
        <div className="px-10 py-4 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 text-white font-black text-2xl shadow-2xl shadow-pink-500/40 flex items-center gap-3 border-2 border-white/30">
          <Sparkles className="w-7 h-7 text-yellow-300 animate-spin" />
          <span>התחילו עוד היום – פשוט, חכם וכיף לילדים!</span>
          <Sparkles className="w-7 h-7 text-yellow-300 animate-spin" />
        </div>
      </div>
    </AbsoluteFill>
  );
};
