import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DeviceMockup } from "../components/DeviceMockup";
import { Gift, Plus, Star, Check } from "lucide-react";

export const ParentShopScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  // Cards cascade entrance
  const card1 = spring({ frame: frame - 10, fps, config: { damping: 12 } });
  const card2 = spring({ frame: frame - 20, fps, config: { damping: 12 } });
  const card3 = spring({ frame: frame - 30, fps, config: { damping: 12 } });
  const card4 = spring({ frame: frame - 40, fps, config: { damping: 12 } });

  // Scene exit fade
  const exitOpacity = interpolate(frame, [95, 110], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const rewards = [
    {
      title: "שעה של משחק במחשב / פלייסטיישן",
      icon: "🎮",
      cost: 50,
      category: "מסכים",
      color: "from-blue-500/20 to-indigo-500/10 border-blue-500/30",
      springVal: card1,
    },
    {
      title: "גלידה מפנקת עם 3 תוספות",
      icon: "🍦",
      cost: 30,
      category: "פינוק",
      color: "from-pink-500/20 to-rose-500/10 border-pink-500/30",
      springVal: card2,
    },
    {
      title: "ערב סרט משפחתי עם פופקורן",
      icon: "🎬",
      cost: 60,
      category: "זמן איכות",
      color: "from-purple-500/20 to-indigo-500/10 border-purple-500/30",
      springVal: card3,
    },
    {
      title: "כרטיס לפארק טרמפולינות / אטרקציה",
      icon: "🎪",
      cost: 150,
      category: "אטרקציה גדולה",
      color: "from-amber-500/20 to-yellow-500/10 border-amber-500/30",
      springVal: card4,
    },
  ];

  return (
    <AbsoluteFill
      className="items-center justify-center p-12 select-none"
      style={{
        opacity: exitOpacity,
        transform: `scale(${interpolate(entrance, [0, 1], [0.93, 1])})`,
      }}
      dir="rtl"
    >
      <div className="w-full max-w-5xl flex flex-col gap-5">
        {/* Scene Title Callout */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎁</span>
            <div>
              <h2 className="text-3xl font-black text-white">3. צד ההורה: הגדרת חנות פרסים מעצימה</h2>
              <p className="text-pink-200 text-lg">בוחרים פרסים מעוררי מוטיבציה שמתאימים בדיוק לילדים שלכם</p>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-pink-500/20 text-pink-300 border border-pink-500/30 font-bold text-sm">
            חנות פרסים משפחתית
          </span>
        </div>

        {/* Main Mockup UI */}
        <DeviceMockup
          title="Kids Ranking — ניהול פרסים ותגמולים"
          badge="חנות פרסים"
          className="w-full h-[580px]"
          theme="parent"
        >
          <div className="p-6 flex flex-col gap-6 h-full">
            {/* Quick Add Bar */}
            <div className="bg-[#17223b] border border-pink-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-300">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">הוספת פרס חדש לחנות</h4>
                  <p className="text-slate-400 text-xs">הגדרת עלות בכוכבים ותיאור הפרס</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-4 py-2 rounded-xl bg-pink-600 text-white font-bold text-sm flex items-center gap-1.5 shadow-lg shadow-pink-600/30">
                  <Plus className="w-4 h-4" />
                  הוסף פרס
                </span>
              </div>
            </div>

            {/* Rewards Cards Grid */}
            <div className="grid grid-cols-2 gap-4 flex-1">
              {rewards.map((r, i) => (
                <div
                  key={i}
                  className={`p-5 rounded-2xl bg-gradient-to-br ${r.color} border flex flex-col justify-between shadow-lg`}
                  style={{
                    transform: `scale(${interpolate(r.springVal, [0, 1], [0.85, 1])})`,
                    opacity: r.springVal,
                  }}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-4xl drop-shadow-md">{r.icon}</span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-slate-300 font-semibold">
                      {r.category}
                    </span>
                  </div>

                  <div className="my-2">
                    <h4 className="font-extrabold text-white text-lg leading-snug">{r.title}</h4>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div className="flex items-center gap-1.5 text-amber-300 font-black text-lg">
                      <Star className="w-5 h-5 fill-amber-300" />
                      <span>{r.cost} כוכבים</span>
                    </div>

                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      פעיל בחנות
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DeviceMockup>
      </div>
    </AbsoluteFill>
  );
};
