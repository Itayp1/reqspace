import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DeviceMockup } from "../components/DeviceMockup";
import { Zap, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

export const EasyLoginScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  // Parent Google click animation
  const parentClickFrame = 35;
  const isParentLogged = frame >= parentClickFrame;
  const parentSuccessSpring = spring({
    frame: frame - parentClickFrame,
    fps,
    config: { damping: 11, stiffness: 150 },
  });

  // Kid scanning animation
  const scanProgress = interpolate(frame, [30, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const kidConnectFrame = 80;
  const isKidLogged = frame >= kidConnectFrame;
  const kidSuccessSpring = spring({
    frame: frame - kidConnectFrame,
    fps,
    config: { damping: 11, stiffness: 150 },
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
      <div className="w-full max-w-5xl flex flex-col gap-5">
        {/* Scene Title Callout */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔑</span>
            <div>
              <h2 className="text-3xl font-black text-white">1. איזה קל להתחבר! בלי סיסמאות ובלי להסתבך</h2>
              <p className="text-indigo-200 text-lg">ההורה נכנס בקליק אחד עם Google · הילד סורק קוד QR ומתחבר מיד</p>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-sm flex items-center gap-1.5">
            <Zap className="w-4 h-4 fill-emerald-300" />
            התחברות ב-1 שניה
          </span>
        </div>

        {/* Dual Panels: Parent Google Login (Right) & Kid QR Login (Left) */}
        <div className="grid grid-cols-12 gap-8 items-center h-[560px]">
          {/* Parent Login Card */}
          <div className="col-span-6 h-full">
            <DeviceMockup
              title="כניסת הורים — Kids Ranking"
              badge="Google Sign-In"
              className="w-full h-full"
              theme="parent"
            >
              <div className="p-8 flex flex-col items-center justify-center gap-6 h-full text-center">
                <div className="w-20 h-20 rounded-3xl bg-indigo-600/20 border border-indigo-400/40 flex items-center justify-center text-4xl shadow-lg">
                  👨‍👩‍👧
                </div>

                <div>
                  <h3 className="font-extrabold text-white text-2xl">כניסה למרחב ההורים</h3>
                  <p className="text-slate-300 text-sm mt-1">חיבור מהיר ומאובטח לניהול המשפחה</p>
                </div>

                {!isParentLogged ? (
                  <div className="w-full max-w-sm flex flex-col gap-3">
                    {/* Google Sign In Button */}
                    <div
                      className="w-full py-4 px-6 rounded-2xl bg-white text-slate-800 font-bold text-lg flex items-center justify-center gap-3 shadow-xl hover:shadow-2xl transition cursor-pointer border border-slate-200"
                      style={{
                        transform: `scale(${frame >= 25 && frame < parentClickFrame ? 0.96 : 1})`,
                      }}
                    >
                      <svg className="w-6 h-6" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.27a7.17 7.17 0 0 1 0-4.54V6.58H1.25a11.98 11.98 0 0 0 0 10.84l4.03-3.15z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                      </svg>
                      <span>התחבר בלחיצה אחת עם Google</span>
                    </div>
                    <span className="text-xs text-slate-400">ללא צורך בזכירת סיסמה · מאובטח ואישי</span>
                  </div>
                ) : (
                  <div
                    className="w-full max-w-sm p-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center gap-3 text-emerald-300 font-bold text-lg"
                    style={{
                      transform: `scale(${interpolate(parentSuccessSpring, [0, 1], [0.85, 1])})`,
                    }}
                  >
                    <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                    <span>שלום יוסי! מחובר כהורה מוביל</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-indigo-300/80">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span>סנכרון מיידי בין כל מכשירי הבית</span>
                </div>
              </div>
            </DeviceMockup>
          </div>

          {/* Child QR Login Card */}
          <div className="col-span-6 h-full">
            <DeviceMockup
              title="כניסת ילד — סריקת QR מהירה"
              badge="מצב ילד"
              className="w-full h-full"
              theme="child"
            >
              <div className="p-8 flex flex-col items-center justify-center gap-6 h-full text-center">
                <div className="w-20 h-20 rounded-3xl bg-purple-600/20 border border-purple-400/40 flex items-center justify-center text-4xl shadow-lg">
                  👦
                </div>

                <div>
                  <h3 className="font-extrabold text-white text-2xl">כניסת הילד (תומר, בן 9)</h3>
                  <p className="text-purple-300 text-sm mt-1">סורקים את הקוד מהמכשיר של ההורה ונכנסים מיד</p>
                </div>

                {!isKidLogged ? (
                  <div className="relative p-4 rounded-2xl bg-white shadow-2xl border-2 border-purple-400/40 flex flex-col items-center justify-center">
                    {/* QR Code Graphic with scanner */}
                    <div className="relative w-36 h-36 border-4 border-slate-900 rounded-xl p-2 flex flex-col justify-between bg-white">
                      <div className="flex justify-between">
                        <div className="w-8 h-8 border-4 border-black p-0.5 flex items-center justify-center">
                          <div className="w-3 h-3 bg-black" />
                        </div>
                        <div className="w-8 h-8 border-4 border-black p-0.5 flex items-center justify-center">
                          <div className="w-3 h-3 bg-black" />
                        </div>
                      </div>
                      <div className="self-center flex items-center justify-center w-8 h-8 rounded-lg bg-purple-600 text-white text-xs">
                        ★
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="w-8 h-8 border-4 border-black p-0.5 flex items-center justify-center">
                          <div className="w-3 h-3 bg-black" />
                        </div>
                        <div className="grid grid-cols-3 gap-0.5 w-8 h-8">
                          {Array.from({ length: 9 }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 ${i % 2 === 0 ? "bg-black" : "bg-transparent"} rounded-[1px]`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Moving Laser Scan */}
                      {frame >= 30 && frame <= 75 && (
                        <div
                          className="absolute left-1 right-1 h-1 bg-gradient-to-r from-emerald-400 via-green-300 to-emerald-500 shadow-md shadow-emerald-400 rounded-full"
                          style={{
                            top: `${scanProgress * 130 + 6}px`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className="w-full max-w-sm p-4 rounded-2xl bg-purple-500/20 border border-purple-400/50 flex flex-col items-center justify-center gap-2 text-purple-200 font-bold shadow-lg"
                    style={{
                      transform: `scale(${interpolate(kidSuccessSpring, [0, 1], [0.85, 1])})`,
                    }}
                  >
                    <div className="flex items-center gap-2 text-emerald-300 text-lg">
                      <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                      <span>תומר מחובר בהצלחה! 🎉</span>
                    </div>
                    <span className="text-xs text-purple-300 font-normal">הכוכבים והמשימות סונכרנו מיד</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-purple-300/80">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>בלי סיסמאות ובלי לזכור שמות משתמש</span>
                </div>
              </div>
            </DeviceMockup>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
