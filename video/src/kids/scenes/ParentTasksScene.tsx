import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DeviceMockup } from "../components/DeviceMockup";
import { Plus, Check, Star, Clock } from "lucide-react";

export const ParentTasksScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  // Simulated task creation steps
  const typeTextProgress = interpolate(frame, [15, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fullText = "סידור החדר והמיטה 🛏️";
  const displayedText = fullText.slice(0, Math.floor(typeTextProgress * fullText.length));

  // Save button click animation
  const clickFrame = 65;
  const isClicked = frame >= clickFrame;
  const buttonScale = spring({
    frame: frame - clickFrame,
    fps,
    config: { damping: 10, stiffness: 200 },
  });

  // New card emergence
  const newCardProgress = spring({
    frame: frame - 72,
    fps,
    config: { damping: 12, mass: 0.7, stiffness: 120 },
  });

  // Exit transition
  const exitOpacity = interpolate(frame, [110, 125], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      className="items-center justify-center p-12 select-none"
      style={{
        opacity: exitOpacity,
        transform: `scale(${interpolate(entrance, [0, 1], [0.92, 1])})`,
      }}
      dir="rtl"
    >
      <div className="w-full max-w-5xl flex flex-col gap-5">
        {/* Scene Title Callout */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📝</span>
            <div>
              <h2 className="text-3xl font-black text-white">2. צד ההורה: יצירת משימות מותאמות אישית</h2>
              <p className="text-indigo-200 text-lg">ההורה מגדיר משימות יומיומיות, תזמונים וכוכבים לתגמול</p>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold text-sm">
            לוח בקרה להורים
          </span>
        </div>

        {/* Main Mockup UI */}
        <DeviceMockup
          title="Kids Ranking — ניהול משימות לילדים"
          badge="מצב הורה"
          className="w-full h-[580px]"
          theme="parent"
        >
          <div className="p-6 flex flex-col gap-6 h-full">
            {/* Top Form / Task Creator Bar */}
            <div className="bg-[#17223b] border border-indigo-500/30 rounded-2xl p-4 flex flex-col gap-4 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  הוספת משימה חדשה למערכת
                </span>
                <span className="text-xs bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full border border-amber-500/30 font-bold">
                  תגמול מומלץ: 15 כוכבים
                </span>
              </div>

              <div className="grid grid-cols-12 gap-3 items-center">
                {/* Title Input field with typing animation */}
                <div className="col-span-6 bg-[#0c1222] border border-indigo-400/40 rounded-xl px-4 py-2.5 flex items-center justify-between text-base">
                  <span className="text-white font-semibold">
                    {displayedText}
                    {frame < 55 && <span className="inline-block w-2 h-4 bg-indigo-400 ml-1 animate-pulse" />}
                  </span>
                  <span className="text-slate-400 text-xs">שם המשימה</span>
                </div>

                {/* Stars reward selector */}
                <div className="col-span-3 bg-[#0c1222] border border-indigo-400/40 rounded-xl px-4 py-2.5 flex items-center justify-between text-base">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <Star className="w-4 h-4 fill-amber-400" />
                    <span>+15</span>
                  </div>
                  <span className="text-slate-400 text-xs">כוכבים</span>
                </div>

                {/* Save Task Action Button */}
                <div className="col-span-3">
                  <button
                    type="button"
                    className={`w-full py-2.5 px-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all ${
                      isClicked
                        ? "bg-emerald-500 text-white shadow-emerald-500/30"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30"
                    }`}
                    style={{
                      transform: isClicked ? `scale(${interpolate(buttonScale, [0, 1], [0.92, 1])})` : "none",
                    }}
                  >
                    {isClicked ? (
                      <>
                        <Check className="w-5 h-5 text-white" />
                        <span>נשמר בהצלחה!</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        <span>שמור משימה</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Schedule Days Selector Row */}
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <span className="font-semibold text-slate-400">ימים פעילים:</span>
                {["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"].map((d, i) => (
                  <span
                    key={i}
                    className="w-7 h-7 rounded-lg bg-indigo-600/40 border border-indigo-400/50 flex items-center justify-center font-bold text-indigo-200"
                  >
                    {d}
                  </span>
                ))}
                <span className="mr-auto flex items-center gap-1 text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>שעות יעד: 07:00 - 20:00</span>
                </span>
              </div>
            </div>

            {/* Active Tasks Feed */}
            <div className="flex-1 flex flex-col gap-3">
              <span className="text-xs font-bold text-slate-400 tracking-wider">
                משימות פעילות במשפחה ({isClicked ? "4 משימות" : "3 משימות"}):
              </span>

              <div className="grid grid-cols-2 gap-3.5">
                {/* Brand new saved card (Springs into view upon save!) */}
                {isClicked && (
                  <div
                    className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-indigo-950/60 border-2 border-emerald-400/60 flex items-center justify-between shadow-xl"
                    style={{
                      transform: `scale(${interpolate(newCardProgress, [0, 1], [0.8, 1])})`,
                      opacity: newCardProgress,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">🛏️</span>
                      <div>
                        <h4 className="font-bold text-white text-base">סידור החדר והמיטה</h4>
                        <span className="text-xs text-emerald-300 font-medium">נוסף עכשיו • יומי</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 font-black text-sm border border-amber-400/40">
                      <Star className="w-4 h-4 fill-amber-400" />
                      <span>+15</span>
                    </div>
                  </div>
                )}

                {/* Existing Card 1 */}
                <div className="p-4 rounded-2xl bg-[#131c33] border border-indigo-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">📚</span>
                    <div>
                      <h4 className="font-bold text-white text-base">הכנת שיעורי בית במתמטיקה</h4>
                      <span className="text-xs text-slate-400">יומי • עד 18:00</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 font-black text-sm border border-amber-400/30">
                    <Star className="w-4 h-4 fill-amber-400" />
                    <span>+25</span>
                  </div>
                </div>

                {/* Existing Card 2 */}
                <div className="p-4 rounded-2xl bg-[#131c33] border border-indigo-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🦷</span>
                    <div>
                      <h4 className="font-bold text-white text-base">צחצוח שיניים בוקר וערב</h4>
                      <span className="text-xs text-slate-400">יומי • פעמיים ביום</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 font-black text-sm border border-amber-400/30">
                    <Star className="w-4 h-4 fill-amber-400" />
                    <span>+10</span>
                  </div>
                </div>

                {/* Existing Card 3 */}
                {!isClicked && (
                  <div className="p-4 rounded-2xl bg-[#131c33] border border-indigo-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">🐕</span>
                      <div>
                        <h4 className="font-bold text-white text-base">הורדת הכלב לטיול</h4>
                        <span className="text-xs text-slate-400">יומי • אחר הצהריים</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 font-black text-sm border border-amber-400/30">
                      <Star className="w-4 h-4 fill-amber-400" />
                      <span>+20</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DeviceMockup>
      </div>
    </AbsoluteFill>
  );
};
