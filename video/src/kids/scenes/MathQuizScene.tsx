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
import { Star, Volume2, CheckCircle2, Brain, Flame } from "lucide-react";

export const MathQuizScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  // Answer selection frame
  const selectFrame = 45;
  const isSelected = frame >= selectFrame;

  const successSpring = spring({
    frame: frame - selectFrame,
    fps,
    config: { damping: 10, stiffness: 160 },
  });

  // Scene exit fade
  const exitOpacity = interpolate(frame, [125, 140], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const options = [
    { text: "54", correct: false, id: "A" },
    { text: "56", correct: true, id: "B" },
    { text: "48", correct: false, id: "C" },
    { text: "63", correct: false, id: "D" },
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
      {/* Confetti burst on correct answer */}
      {isSelected && <Confetti triggerFrame={selectFrame} count={45} />}

      <div className="w-full max-w-5xl flex flex-col gap-5">
        {/* Scene Title Callout */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🧮</span>
            <div>
              <h2 className="text-3xl font-black text-white">5. מבחני חשיבה ומתמטיקה חכמים לילדים</h2>
              <p className="text-purple-200 text-lg">שאלות מותאמות גיל, פידבק מיידי, קריינות קולית ותגמול כוכבים!</p>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold text-sm flex items-center gap-1.5">
            <Brain className="w-4 h-4 fill-purple-300" />
            מבחן מתמטיקה אינטראקטיבי
          </span>
        </div>

        {/* Child Tablet Viewport */}
        <DeviceMockup
          title="Kids Ranking — אתגר מתמטיקה יומי 🧮"
          badge="מבחן חכם"
          className="w-full h-[580px]"
          theme="child"
        >
          <div className="p-6 flex flex-col gap-4 h-full justify-between">
            {/* Quiz Header Bar: Progress & Streaks */}
            <div className="flex items-center justify-between bg-[#241540] border border-purple-500/30 rounded-2xl px-5 py-2.5 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-purple-200">שאלה 4 מתוך 5</span>
                <div className="w-40 h-2.5 rounded-full bg-purple-950 overflow-hidden border border-purple-500/30">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all"
                    style={{
                      width: `${isSelected ? 80 : 60}%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-sm">
                  <Flame className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span>רצף 3 נכונות! 🔥</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-extrabold text-sm">
                  <Star className="w-4 h-4 fill-yellow-400" />
                  <span>+10 כוכבים</span>
                </div>
              </div>
            </div>

            {/* Main Question Box */}
            <div className="bg-gradient-to-b from-[#2b184f] to-[#1c1135] border-2 border-purple-400/40 rounded-3xl p-4 flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-3 left-4">
                <div className="px-2.5 py-1.5 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300 flex items-center gap-1.5 text-xs font-bold">
                  <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                  <span>הקראה קולית</span>
                </div>
              </div>

              <span className="text-purple-300 text-xs font-semibold mb-1">לוח הכפל · כיתה ג׳-ד׳</span>
              <h3 className="text-4xl font-black text-white tracking-wide mb-1 drop-shadow-md">
                כמה זה 8 × 7 ?
              </h3>
              <p className="text-slate-300 text-xs">בחר את התשובה הנכונה ביותר:</p>
            </div>

            {/* Answer Options Grid */}
            <div className="grid grid-cols-2 gap-3">
              {options.map((opt) => {
                const isThisSelected = isSelected && opt.correct;

                return (
                  <div
                    key={opt.id}
                    className={`p-4 rounded-2xl border-2 font-black text-xl flex items-center justify-between transition-all shadow-lg ${
                      isThisSelected
                        ? "bg-gradient-to-r from-emerald-600/40 to-green-500/30 border-emerald-400 text-emerald-300 shadow-emerald-500/20 scale-[1.02]"
                        : "bg-[#1f1338] border-purple-400/20 text-white hover:border-purple-400/40"
                    }`}
                    style={{
                      transform: isThisSelected
                        ? `scale(${interpolate(successSpring, [0, 1], [1, 1.03])})`
                        : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-400/30 flex items-center justify-center text-xs font-bold">
                        {opt.id}
                      </span>
                      <span>{opt.text}</span>
                    </div>

                    {isThisSelected && (
                      <div className="flex items-center gap-1 text-emerald-400 font-extrabold text-base">
                        <CheckCircle2 className="w-6 h-6 fill-emerald-400 text-black" />
                        <span>נכון מאוד!</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Instant Reward Feedback Banner */}
            {isSelected ? (
              <div
                className="bg-emerald-500/20 border border-emerald-400/60 rounded-2xl p-4 flex items-center justify-between shadow-xl"
                style={{
                  transform: `scale(${interpolate(successSpring, [0, 1], [0.92, 1])})`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🎉</span>
                  <div>
                    <h4 className="font-black text-white text-lg">כל הכבוד, תומר! תשובה נכונה בניסיון ראשון!</h4>
                    <p className="text-emerald-300 text-xs">התשובה נשמרה בלוח ההתקדמות של ההורים</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400/20 border border-amber-400/50 text-amber-300 font-black text-lg">
                  <Star className="w-5 h-5 fill-amber-400" />
                  <span>+10 כוכבים נצברו!</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-purple-300/80 text-xs font-semibold py-2">
                מענה על שאלות מתמטיקה מקנה כוכבים ומחזק את הביטחון בלמידה 🚀
              </div>
            )}
          </div>
        </DeviceMockup>
      </div>
    </AbsoluteFill>
  );
};
