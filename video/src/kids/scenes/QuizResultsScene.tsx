import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DeviceMockup } from "../components/DeviceMockup";
import { TrendingUp, CheckCircle2, Clock, Target, Award, BarChart3 } from "lucide-react";

export const QuizResultsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  // Staggered card animations
  const statsProgress = spring({ frame: frame - 15, fps, config: { damping: 12 } });
  const tableProgress = spring({ frame: frame - 30, fps, config: { damping: 12 } });
  const detailProgress = spring({ frame: frame - 45, fps, config: { damping: 12 } });

  // Scene exit fade
  const exitOpacity = interpolate(frame, [125, 140], [1, 0], {
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
      <div className="w-full max-w-5xl flex flex-col gap-5">
        {/* Scene Title Callout */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <div>
              <h2 className="text-3xl font-black text-white">7. מעקב תוצאות ומבחני למידה לדוגמה במתמטיקה</h2>
              <p className="text-indigo-200 text-lg">ההורה רואה בדיוק את התקדמות הילד: אחוזי הצלחה, מהירות פתרון ומגמות שיפור</p>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold text-sm flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" />
            דוח התקדמות מקיף
          </span>
        </div>

        {/* Parent Mockup UI */}
        <DeviceMockup
          title="Kids Ranking — דוח התקדמות ומבחנים: תומר (בן 9)"
          badge="דוח לימודי"
          className="w-full h-[580px]"
          theme="parent"
        >
          <div className="p-7 flex flex-col gap-5 h-full justify-between">
            {/* Top 4 KPI Metrics Cards */}
            <div
              className="grid grid-cols-4 gap-4"
              style={{
                opacity: statsProgress,
                transform: `translateY(${interpolate(statsProgress, [0, 1], [20, 0])}px)`,
              }}
            >
              <div className="p-4 rounded-2xl bg-[#17223b] border border-indigo-500/30 flex flex-col gap-1">
                <span className="text-xs text-indigo-300 font-semibold flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  הצלחה כללית
                </span>
                <span className="text-3xl font-black text-emerald-400">95%</span>
                <span className="text-[11px] text-slate-400">מענה נכון במבחנים</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#17223b] border border-indigo-500/30 flex flex-col gap-1">
                <span className="text-xs text-indigo-300 font-semibold flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  מגמת שיפור
                </span>
                <span className="text-3xl font-black text-white flex items-center gap-1">
                  בשיפור 📈
                </span>
                <span className="text-[11px] text-emerald-300 font-semibold">+14% מהשבוע הקודם</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#17223b] border border-indigo-500/30 flex flex-col gap-1">
                <span className="text-xs text-indigo-300 font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  מהירות לשאלה
                </span>
                <span className="text-3xl font-black text-amber-300">1.8 שנ׳</span>
                <span className="text-[11px] text-slate-400">זמן חשיבה מהיר ומדויק</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#17223b] border border-indigo-500/30 flex flex-col gap-1">
                <span className="text-xs text-indigo-300 font-semibold flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-purple-400" />
                  ניסיון ראשון
                </span>
                <span className="text-3xl font-black text-purple-300">90%</span>
                <span className="text-[11px] text-slate-400">ללא צורך ברמזים או תיקון</span>
              </div>
            </div>

            {/* Detailed Subject Performance Breakdown */}
            <div
              className="bg-[#141e35] border border-indigo-500/30 rounded-2xl p-5 flex flex-col gap-4 shadow-xl"
              style={{
                opacity: tableProgress,
                transform: `translateY(${interpolate(tableProgress, [0, 1], [20, 0])}px)`,
              }}
            >
              <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🧮</span>
                  <h4 className="font-extrabold text-white text-lg">פירוט נושאי לימוד — מתמטיקה וחשבון</h4>
                </div>
                <span className="text-xs text-indigo-300 bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 rounded-full font-bold">
                  מעודכן לפי מבחנים אחרונים
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Topic 1 */}
                <div className="p-3.5 rounded-xl bg-[#0e1628] border border-indigo-500/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">לוח הכפל (כפולות 6-9)</span>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                      בשיפור
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>שיעור הצלחה: <strong className="text-emerald-400 font-extrabold">98%</strong></span>
                    <span>מהירות: 1.5 שנ׳</span>
                  </div>
                </div>

                {/* Topic 2 */}
                <div className="p-3.5 rounded-xl bg-[#0e1628] border border-indigo-500/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">חיבור וחיסור במאונך</span>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                      יציב
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>שיעור הצלחה: <strong className="text-emerald-400 font-extrabold">94%</strong></span>
                    <span>מהירות: 2.0 שנ׳</span>
                  </div>
                </div>

                {/* Topic 3 */}
                <div className="p-3.5 rounded-xl bg-[#0e1628] border border-indigo-500/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">שברים פשוטים וסדרות</span>
                    <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                      לחיזוק קל
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>שיעור הצלחה: <strong className="text-amber-400 font-extrabold">86%</strong></span>
                    <span>מהירות: 2.8 שנ׳</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Last Quiz Itemized Review Row */}
            <div
              className="p-4 rounded-xl bg-[#111a2f] border border-indigo-500/20 flex items-center justify-between text-xs"
              style={{
                opacity: detailProgress,
              }}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-slate-200 font-bold">
                  מבחן אחרון (היום 15:30): 5 מתוך 5 תשובות נכונות (כולל 8 × 7 = 56)
                </span>
              </div>
              <span className="text-indigo-300 font-semibold">
                שקיפות מלאה להורה ללא ויכוחים או תסכולים! ✨
              </span>
            </div>
          </div>
        </DeviceMockup>
      </div>
    </AbsoluteFill>
  );
};
