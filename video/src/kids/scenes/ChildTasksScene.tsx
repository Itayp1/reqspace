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
import { Star, Flame, CheckCircle2, Clock, Sparkles, Trophy } from "lucide-react";

export const ChildTasksScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  // Action frame: child taps "סיימתי!"
  const completeFrame = 40;
  const isCompleted = frame >= completeFrame;

  // Approval frame: parent approves, stars jump!
  const approveFrame = 95;
  const isApproved = frame >= approveFrame;

  // Star points counter animation
  const starCount = Math.floor(
    interpolate(frame, [approveFrame, approveFrame + 25], [35, 50], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  const starBump = spring({
    frame: frame - approveFrame,
    fps,
    config: { damping: 8, stiffness: 200 },
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
        transform: `scale(${interpolate(entrance, [0, 1], [0.93, 1])})`,
      }}
      dir="rtl"
    >
      {/* Particle celebration on approval */}
      {isApproved && <Confetti triggerFrame={approveFrame} count={40} />}

      <div className="w-full max-w-5xl flex flex-col gap-5">
        {/* Scene Title Callout */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚀</span>
            <div>
              <h2 className="text-3xl font-black text-white">4. המשימות מהצד של הילד</h2>
              <p className="text-amber-200 text-lg">ממשק צבעוני, מהנה ומעצים שמעודד השלמת משימות וצבירת כוכבים!</p>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-sm flex items-center gap-1.5">
            <Trophy className="w-4 h-4 fill-amber-300" />
            מצב ילד (תומר)
          </span>
        </div>

        {/* Child Tablet Viewport */}
        <DeviceMockup
          title="Kids Ranking — המרחב של תומר 🌟"
          badge="מצב ילד"
          className="w-full h-[580px]"
          theme="child"
        >
          <div className="p-6 flex flex-col gap-5 h-full">
            {/* Child Hero Banner: Greeting, Stars, Streak */}
            <div className="bg-gradient-to-r from-purple-900/60 via-pink-900/40 to-indigo-900/60 border border-purple-400/30 rounded-2xl p-4 flex items-center justify-between shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 to-amber-400 p-0.5 shadow-lg">
                  <div className="w-full h-full rounded-[14px] bg-[#1a0e30] flex items-center justify-center text-3xl">
                    👦
                  </div>
                </div>
                <div>
                  <h3 className="font-black text-white text-xl">בוקר טוב, תומר! 🌟</h3>
                  <p className="text-purple-200 text-xs">נותרו לך 2 משימות להשלמה להיום</p>
                </div>
              </div>

              {/* Stats badges */}
              <div className="flex items-center gap-4">
                {/* Daily Streak */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/20 border border-orange-400/40 text-orange-300 font-bold text-sm">
                  <Flame className="w-5 h-5 fill-orange-400 text-orange-400" />
                  <span>רצף: 4 ימים!</span>
                </div>

                {/* Animated Star Points Counter */}
                <div
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400/30 to-yellow-400/20 border-2 border-amber-400 text-amber-300 font-black text-xl shadow-lg shadow-amber-400/20"
                  style={{
                    transform: isApproved ? `scale(${interpolate(starBump, [0, 1], [1.2, 1])})` : "none",
                  }}
                >
                  <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
                  <span>{starCount} כוכבים</span>
                </div>
              </div>
            </div>

            {/* Parent Approval Notification Dropdown */}
            {isApproved && (
              <div
                className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-600/90 to-green-600/90 border border-emerald-300 text-white flex items-center justify-between shadow-2xl animate-bounce"
                style={{
                  transform: `translateY(${interpolate(starBump, [0, 1], [-10, 0])}px)`,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">✨</span>
                  <span className="font-extrabold text-sm">
                    אמא אישרה את סידור החדר! קיבלת 15 כוכבים חדשים!
                  </span>
                </div>
                <div className="flex items-center gap-1 font-black text-base px-3 py-1 rounded-lg bg-black/20">
                  <Star className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                  <span>+15</span>
                </div>
              </div>
            )}

            {/* Child Tasks List Cards */}
            <div className="grid grid-cols-3 gap-4 flex-1">
              {/* Task 1: Bed Making (Interactive Completion) */}
              <div
                className={`p-5 rounded-2xl border flex flex-col justify-between shadow-lg transition-all ${
                  isApproved
                    ? "bg-emerald-950/40 border-emerald-400/50"
                    : isCompleted
                    ? "bg-amber-950/40 border-amber-400/50"
                    : "bg-[#211438] border-purple-500/30"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-4xl">🛏️</span>
                  <div className="flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-400/20 text-amber-300 font-extrabold text-sm border border-amber-400/30">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>+15</span>
                  </div>
                </div>

                <div className="my-2">
                  <h4 className="font-black text-white text-lg">סידור החדר והמיטה</h4>
                  <p className="text-purple-300 text-xs mt-1">לסדר כריות, שמיכה ואת הצעצועים</p>
                </div>

                {/* Dynamic Button Status */}
                <div>
                  {isApproved ? (
                    <div className="w-full py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-bold text-sm flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>הושלם ואושר! (+15⭐)</span>
                    </div>
                  ) : isCompleted ? (
                    <div className="w-full py-2.5 rounded-xl bg-amber-500/20 border border-amber-400 text-amber-300 font-bold text-sm flex items-center justify-center gap-2 animate-pulse">
                      <Clock className="w-4 h-4" />
                      <span>ממתין לאישור הורה ⏳</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-pink-500/30 hover:opacity-95"
                    >
                      <Sparkles className="w-4 h-4 text-yellow-300" />
                      <span>סיימתי את המשימה!</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Task 2: Math Homework */}
              <div className="p-5 rounded-2xl bg-[#211438] border border-purple-500/30 flex flex-col justify-between shadow-lg">
                <div className="flex items-start justify-between">
                  <span className="text-4xl">🧮</span>
                  <div className="flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-400/20 text-amber-300 font-extrabold text-sm border border-amber-400/30">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>+25</span>
                  </div>
                </div>

                <div className="my-2">
                  <h4 className="font-black text-white text-lg">תרגול מתמטיקה יומי</h4>
                  <p className="text-purple-300 text-xs mt-1">חידון 5 שאלות כפל וחילוק</p>
                </div>

                <button
                  type="button"
                  className="w-full py-2.5 rounded-xl bg-purple-700/60 border border-purple-400/40 text-purple-200 font-bold text-sm flex items-center justify-center gap-2"
                >
                  <span>התחל אתגר 🚀</span>
                </button>
              </div>

              {/* Task 3: Brush Teeth */}
              <div className="p-5 rounded-2xl bg-[#211438] border border-purple-500/30 flex flex-col justify-between shadow-lg">
                <div className="flex items-start justify-between">
                  <span className="text-4xl">🦷</span>
                  <div className="flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-400/20 text-amber-300 font-extrabold text-sm border border-amber-400/30">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>+10</span>
                  </div>
                </div>

                <div className="my-2">
                  <h4 className="font-black text-white text-lg">צחצוח שיניים בערב</h4>
                  <p className="text-purple-300 text-xs mt-1">2 דקות צחצוח יסודי</p>
                </div>

                <button
                  type="button"
                  className="w-full py-2.5 rounded-xl bg-purple-700/60 border border-purple-400/40 text-purple-200 font-bold text-sm flex items-center justify-center gap-2"
                >
                  <span>סיימתי! 🦷</span>
                </button>
              </div>
            </div>
          </div>
        </DeviceMockup>
      </div>
    </AbsoluteFill>
  );
};
