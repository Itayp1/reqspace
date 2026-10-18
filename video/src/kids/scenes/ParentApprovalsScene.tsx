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
import { Check, CheckCircle2, Bell, Clock, Star, UserCheck } from "lucide-react";

export const ParentApprovalsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  // Parent approval click frame
  const approveFrame = 45;
  const isApproved = frame >= approveFrame;

  const approveSpring = spring({
    frame: frame - approveFrame,
    fps,
    config: { damping: 10, stiffness: 180 },
  });

  // Scene exit fade
  const exitOpacity = interpolate(frame, [120, 135], [1, 0], {
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
      {/* Confetti celebration on approval */}
      {isApproved && <Confetti triggerFrame={approveFrame} count={35} />}

      <div className="w-full max-w-5xl flex flex-col gap-5">
        {/* Scene Title Callout */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✅</span>
            <div>
              <h2 className="text-3xl font-black text-white">6. איזה קל להורה לעקוב אחרי המשימות ולאשר אותן!</h2>
              <p className="text-indigo-200 text-lg">התראות בזמן אמת, פירוט מלא של הביצוע ואישור בקליק אחד מהיר</p>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-sm flex items-center gap-1.5">
            <UserCheck className="w-4 h-4" />
            אישור הורה בקליק
          </span>
        </div>

        {/* Parent Mockup UI */}
        <DeviceMockup
          title="Kids Ranking — לוח אישורים ומעקב הורים"
          badge="אישורים בזמן אמת"
          className="w-full h-[580px]"
          theme="parent"
        >
          <div className="p-7 flex flex-col gap-6 h-full justify-between">
            {/* Top Real-time Bar */}
            <div className="flex items-center justify-between bg-[#15213b] border border-indigo-500/30 rounded-2xl px-5 py-3 shadow-md">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
                <span className="text-sm font-bold text-white">סנכרון חי ועדכונים בזמן אמת</span>
                <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-3 py-0.5 rounded-full font-semibold">
                  מאושר כעת כ: אבא (יוסי)
                </span>
              </div>

              <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold">
                <Bell className="w-4 h-4 text-amber-400 animate-bounce" />
                <span>התקבלה משימה חדשה לבדיקה!</span>
              </div>
            </div>

            {/* Submissions List */}
            <div className="flex flex-col gap-4 flex-1">
              {/* Task 1: Math Quiz Submission (Target of click) */}
              <div
                className={`p-5 rounded-2xl border-2 transition-all shadow-xl flex flex-col gap-3 ${
                  isApproved
                    ? "bg-gradient-to-r from-emerald-950/60 to-green-900/30 border-emerald-400 shadow-emerald-500/10"
                    : "bg-[#18233f] border-indigo-500/40"
                }`}
                style={{
                  transform: isApproved
                    ? `scale(${interpolate(approveSpring, [0, 1], [0.98, 1])})`
                    : undefined,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-2xl">
                      🧮
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-white text-lg">חידון מתמטיקה יומי</h4>
                        <span className="text-xs bg-purple-500/20 text-purple-300 px-2.5 py-0.5 rounded-full font-bold border border-purple-400/30">
                          תומר (בן 9)
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">הוגש לפני 3 דקות</span>
                    </div>
                  </div>

                  {/* Approve Action Button or Approved Badge */}
                  {!isApproved ? (
                    <div
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-black text-base shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95 transition"
                      style={{
                        transform: `scale(${frame >= 35 && frame < approveFrame ? 0.95 : 1})`,
                      }}
                    >
                      <Check className="w-5 h-5 stroke-[3]" />
                      <span>אשר משימה (+10 כוכבים)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-extrabold text-base shadow-md">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                      <span>אושר בהצלחה ע״י אבא!</span>
                    </div>
                  )}
                </div>

                {/* Inline Quiz Summary for Parent */}
                <div className="bg-[#0e1628]/80 border border-indigo-500/20 rounded-xl p-3 flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-4">
                    <span className="text-emerald-400 font-bold">✅ 5 מתוך 5 נכונות</span>
                    <span className="text-slate-400">❌ 0 טעויות</span>
                    <span className="text-indigo-300">⏱ זמן ביצוע: 1:45 דק׳</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                    <Star className="w-3.5 h-3.5 fill-amber-300" />
                    <span>ציון מושלם 100% · כל הכוכבים אושרו</span>
                  </div>
                </div>
              </div>

              {/* Task 2: Room Cleaning Submission */}
              <div className="p-5 rounded-2xl bg-[#131d33] border border-indigo-500/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-2xl">
                    🛏️
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-base">סידור החדר והמיטה</h4>
                      <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-semibold">
                        תומר (בן 9)
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">תגמול: 15 כוכבים · הוגש הבוקר</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    ממתין לבדיקה
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Info Tip */}
            <div className="p-4 rounded-xl bg-indigo-900/30 border border-indigo-400/20 flex items-center justify-between text-xs text-indigo-200">
              <span className="font-medium">
                💡 בלחיצה אחת בלבד: המשימה מאושרת, הכוכבים עוברים לילד, וההתקדמות מתעדכנת מיד!
              </span>
              <span className="text-emerald-400 font-bold">0 מאמץ להורים</span>
            </div>
          </div>
        </DeviceMockup>
      </div>
    </AbsoluteFill>
  );
};
