import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DeviceMockup } from "../components/DeviceMockup";
import { Confetti } from "../components/Confetti";
import { Star, Sparkles, CheckCircle2, ShoppingBag } from "lucide-react";

export const ChildShopScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  // Redemption action frame
  const buyFrame = 40;
  const isBought = frame >= buyFrame;

  const voucherSpring = spring({
    frame: frame - buyFrame,
    fps,
    config: { damping: 11, stiffness: 140 },
  });

  // Star points balance after buying
  const balance = isBought ? 0 : 50;

  // Exit transition
  const exitOpacity = interpolate(frame, [115, 130], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      className="items-center justify-center p-12 select-none"
      style={{
        opacity: exitOpacity,
        transform: `scale(${interpolate(entrance, [0, 1], [0.93, 1])})`,
      }}
      dir="rtl"
    >
      {/* Celebration Confetti when bought */}
      {isBought && <Confetti triggerFrame={buyFrame} count={50} />}

      <div className="w-full max-w-5xl flex flex-col gap-5">
        {/* Scene Title Callout */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛒</span>
            <div>
              <h2 className="text-3xl font-black text-white">8. צד הילד: בחירת פרסים ומימוש כוכבים!</h2>
              <p className="text-pink-200 text-lg">הילד בוחר את הפרס שהרוויח ביושר, מממש כוכבים וחוגג את ההצלחה!</p>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-pink-500/20 text-pink-300 border border-pink-500/30 font-bold text-sm flex items-center gap-1.5">
            <ShoppingBag className="w-4 h-4 fill-pink-300" />
            חנות פרסים לילד
          </span>
        </div>

        {/* Child Tablet Viewport */}
        <DeviceMockup
          title="Kids Ranking — חנות הפרסים של תומר 🎁"
          badge="חנות פרסים"
          className="w-full h-[580px]"
          theme="child"
        >
          <div className="p-6 flex flex-col gap-5 h-full relative">
            {/* Top Store Header */}
            <div className="bg-[#211438] border border-pink-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-pink-500/20 border border-pink-400/40 flex items-center justify-center text-3xl">
                  🎁
                </div>
                <div>
                  <h3 className="font-black text-white text-lg">בחר את הפרס שלך!</h3>
                  <p className="text-purple-300 text-xs">הכוכבים שצברת ממשימות ניתנים למימוש מיידי</p>
                </div>
              </div>

              {/* Star Balance Display */}
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400/20 border border-amber-400/50 text-amber-300 font-black text-xl">
                <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
                <span>יתרה: {balance} כוכבים</span>
              </div>
            </div>

            {/* Shop Cards Grid */}
            <div className="grid grid-cols-3 gap-4 flex-1">
              {/* Prize 1: Gaming Hour (Selected & Bought) */}
              <div
                className={`p-5 rounded-2xl border-2 flex flex-col justify-between shadow-xl transition-all ${
                  isBought
                    ? "bg-purple-950/40 border-pink-400/60"
                    : "bg-gradient-to-b from-indigo-950/60 to-purple-950/60 border-amber-400/70 shadow-amber-500/20"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-5xl drop-shadow">🎮</span>
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-400/30 text-amber-300 font-black text-base border border-amber-400/50">
                    <Star className="w-4 h-4 fill-amber-400" />
                    <span>50 כוכבים</span>
                  </div>
                </div>

                <div className="my-2">
                  <h4 className="font-black text-white text-xl">שעה של משחק בפלייסטיישן</h4>
                  <p className="text-purple-200 text-xs mt-1">אחרי סיום כל המשימות היומיות</p>
                </div>

                <div>
                  {isBought ? (
                    <div className="w-full py-3 rounded-xl bg-pink-600/40 border border-pink-400 text-pink-200 font-black text-sm flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span>נרכש בהצלחה!</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 via-pink-500 to-purple-600 text-white font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-pink-500/40 animate-pulse"
                    >
                      <Sparkles className="w-5 h-5 text-yellow-300" />
                      <span>מימוש פרס עכשיו!</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Prize 2: Ice Cream */}
              <div className="p-5 rounded-2xl bg-[#211438] border border-purple-500/30 flex flex-col justify-between shadow-lg">
                <div className="flex items-start justify-between">
                  <span className="text-5xl">🍦</span>
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 font-black text-base border border-amber-400/30">
                    <Star className="w-4 h-4 fill-amber-400" />
                    <span>30 כוכבים</span>
                  </div>
                </div>

                <div className="my-2">
                  <h4 className="font-black text-white text-xl">גלידה מפנקת עם 3 תוספות</h4>
                  <p className="text-purple-300 text-xs mt-1">ביקור בגלידריה השכונתית</p>
                </div>

                <button
                  type="button"
                  className="w-full py-3 rounded-xl bg-purple-800/40 border border-purple-400/30 text-purple-200 font-bold text-sm"
                >
                  <span>מימוש פרס</span>
                </button>
              </div>

              {/* Prize 3: Movie Night */}
              <div className="p-5 rounded-2xl bg-[#211438] border border-purple-500/30 flex flex-col justify-between shadow-lg">
                <div className="flex items-start justify-between">
                  <span className="text-5xl">🎬</span>
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 font-black text-base border border-amber-400/30">
                    <Star className="w-4 h-4 fill-amber-400" />
                    <span>60 כוכבים</span>
                  </div>
                </div>

                <div className="my-2">
                  <h4 className="font-black text-white text-xl">ערב סרט ופופקורן</h4>
                  <p className="text-purple-300 text-xs mt-1">בוחרים איזה סרט שרוצים!</p>
                </div>

                <div className="w-full py-3 rounded-xl bg-slate-800/40 border border-slate-700 text-slate-400 font-medium text-xs flex items-center justify-center">
                  <span>חסרים 10 כוכבים</span>
                </div>
              </div>
            </div>

            {/* Voucher Celebration Modal Pop-up */}
            {isBought && (
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md rounded-3xl flex items-center justify-center p-6 z-30"
                style={{
                  transform: `scale(${interpolate(voucherSpring, [0, 1], [0.8, 1])})`,
                  opacity: voucherSpring,
                }}
              >
                <div className="bg-gradient-to-tr from-[#251042] to-[#3a1864] border-2 border-pink-400 rounded-3xl p-8 max-w-md w-full text-center flex flex-col items-center gap-4 shadow-2xl shadow-pink-500/40">
                  <div className="w-20 h-20 rounded-full bg-pink-500/20 border-2 border-pink-400 flex items-center justify-center text-5xl shadow-xl">
                    🎉
                  </div>

                  <div>
                    <span className="text-xs font-bold text-pink-300 tracking-wider">שובר פרס הופק בהצלחה!</span>
                    <h3 className="text-2xl font-black text-white mt-1">איזה כיף, תומר! 🎮</h3>
                    <p className="text-purple-200 text-sm mt-2">
                      הרווחת שעה של משחק בפלייסטיישן בעבודה קשה ובסדר מופתי!
                    </p>
                  </div>

                  <div className="w-full py-3 px-4 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-between text-xs text-slate-200">
                    <span>סטטוס: נשלח להורים למימוש</span>
                    <span className="text-emerald-400 font-bold">אושר למימוש היום!</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DeviceMockup>
      </div>
    </AbsoluteFill>
  );
};
