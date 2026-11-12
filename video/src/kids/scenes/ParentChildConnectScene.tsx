import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DeviceMockup } from "../components/DeviceMockup";
import { Smartphone, Zap, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

export const ParentChildConnectScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 13, mass: 0.8 },
  });

  // Kid phone slide-in
  const phoneSlide = spring({
    frame: frame - 25,
    fps,
    config: { damping: 12, mass: 0.7, stiffness: 100 },
  });

  // Scanner laser line movement
  const scanProgress = interpolate(frame, [45, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Success trigger
  const successFrame = 85;
  const isConnected = frame >= successFrame;
  const successSpring = spring({
    frame: frame - successFrame,
    fps,
    config: { damping: 10, stiffness: 160 },
  });

  // Exit transition
  const exitOpacity = interpolate(frame, [130, 150], [1, 0], {
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
            <span className="text-3xl">⚡</span>
            <div>
              <h2 className="text-3xl font-black text-white">3. חיבור מהיר ובטוח: הורה ↔ ילד</h2>
              <p className="text-emerald-200 text-lg">בלי סיסמאות מסובכות – סריקת קוד QR אחת והילד מחובר מיד!</p>
            </div>
          </div>
          <span className="px-4 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-sm flex items-center gap-1.5">
            <Zap className="w-4 h-4 fill-emerald-300" />
            התחברות ב-1 שניה
          </span>
        </div>

        {/* Dual Screen Setup (Parent Tablet on Right, Child Phone on Left) */}
        <div className="grid grid-cols-12 gap-8 items-center h-[560px]">
          {/* Parent Side: Tablet with QR Code Modal */}
          <div className="col-span-7 h-full">
            <DeviceMockup
              title="לוח בקרת הורים — קוד התחברות מהיר"
              badge="הפקת QR"
              className="w-full h-full"
              theme="parent"
            >
              <div className="p-8 flex flex-col items-center justify-center gap-6 h-full text-center">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-2xl">
                    👦
                  </div>
                  <div className="text-right">
                    <h3 className="font-extrabold text-white text-xl">קוד התחברות עבור תומר (בן 9)</h3>
                    <p className="text-slate-400 text-xs">סרוק באמצעות המכשיר של הילד להתחברות מיידית</p>
                  </div>
                </div>

                {/* Glowing QR Code Card */}
                <div className="relative p-5 rounded-3xl bg-white shadow-2xl border-4 border-indigo-500/50 flex flex-col items-center justify-center">
                  {/* Subtle pulsing background glow */}
                  <div className="absolute inset-0 rounded-3xl bg-indigo-400/30 blur-xl animate-pulse" />

                  {/* Simulated High-Res QR Matrix */}
                  <div className="relative w-52 h-52 bg-white rounded-2xl flex flex-col items-center justify-center p-2">
                    <div className="w-full h-full border-4 border-slate-900 rounded-xl p-3 flex flex-col justify-between">
                      {/* Top corners */}
                      <div className="flex justify-between">
                        <div className="w-12 h-12 border-4 border-black p-1 flex items-center justify-center">
                          <div className="w-5 h-5 bg-black" />
                        </div>
                        <div className="w-12 h-12 border-4 border-black p-1 flex items-center justify-center">
                          <div className="w-5 h-5 bg-black" />
                        </div>
                      </div>

                      {/* Middle icon */}
                      <div className="self-center my-auto flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white shadow-md">
                        <Sparkles className="w-6 h-6 text-yellow-300" />
                      </div>

                      {/* Bottom corner */}
                      <div className="flex justify-between items-end">
                        <div className="w-12 h-12 border-4 border-black p-1 flex items-center justify-center">
                          <div className="w-5 h-5 bg-black" />
                        </div>
                        {/* Dot pattern */}
                        <div className="grid grid-cols-4 gap-1 w-14 h-14">
                          {Array.from({ length: 16 }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 ${i % 2 === 0 ? "bg-black" : "bg-transparent"} rounded-sm`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Animated Scanning Laser Line */}
                    {frame >= 40 && frame <= 85 && (
                      <div
                        className="absolute left-2 right-2 h-1 bg-gradient-to-r from-emerald-400 via-green-300 to-emerald-500 shadow-lg shadow-emerald-400/80 rounded-full"
                        style={{
                          top: `${scanProgress * 190 + 10}px`,
                        }}
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-indigo-300 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>מאובטח ע״י טוקן הצפנה משפחתי</span>
                </div>
              </div>
            </DeviceMockup>
          </div>

          {/* Child Side: Phone Mockup Scanning / Connected */}
          <div
            className="col-span-5 h-full flex items-center justify-center"
            style={{
              transform: `translateX(${interpolate(phoneSlide, [0, 1], [-80, 0])}px) scale(${interpolate(phoneSlide, [0, 1], [0.88, 1])})`,
              opacity: phoneSlide,
            }}
          >
            <div className="w-[300px] h-[520px] rounded-[36px] bg-[#1a0f2e] border-4 border-purple-500/40 p-3 shadow-2xl shadow-purple-950/70 flex flex-col overflow-hidden relative">
              {/* Phone Speaker Notch */}
              <div className="w-24 h-4 bg-black/60 rounded-full mx-auto mb-3" />

              {/* Child Viewport */}
              <div className="flex-1 rounded-[26px] bg-[#120a22] border border-purple-400/20 p-4 flex flex-col items-center justify-center text-center">
                {!isConnected ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl bg-purple-500/20 border-2 border-dashed border-purple-400 flex items-center justify-center text-purple-300 animate-pulse">
                      <Smartphone className="w-10 h-10" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-white text-lg">סורק קוד...</h4>
                      <p className="text-purple-300 text-xs mt-1">מכוון למסך ההורה להתחברות</p>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center gap-4"
                    style={{
                      transform: `scale(${interpolate(successSpring, [0, 1], [0.75, 1])})`,
                    }}
                  >
                    <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/30">
                      <CheckCircle2 className="w-12 h-12" />
                    </div>

                    <div>
                      <span className="text-3xl">🎉</span>
                      <h4 className="font-black text-white text-xl mt-2">התחברת בהצלחה!</h4>
                      <p className="text-emerald-300 text-sm font-bold mt-1">שלום תומר, שיהיה יום מנצח!</p>
                    </div>

                    <div className="w-full mt-3 p-3 rounded-xl bg-purple-900/40 border border-purple-400/30 text-xs text-purple-200 font-semibold">
                      כניסה ישירה ללוח המשימות האישי
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
